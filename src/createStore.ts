import $$observable from './utils/symbol-observable'

import {
  Store,
  PreloadedState,
  StoreEnhancer,
  Dispatch,
  Observer,
  ExtendState
} from './types/store'
import { Action } from './types/actions'
import { Reducer } from './types/reducers'
import ActionTypes from './utils/actionTypes'
import isPlainObject from './utils/isPlainObject'

/**
 * Creates a Redux store that holds the state tree.
 * The only way to change the data in the store is to call `dispatch()` on it.
 *
 * There should only be a single store in your app. To specify how different
 * parts of the state tree respond to actions, you may combine several reducers
 * into a single reducer function by using `combineReducers`.
 *
 * 创建一个保存状态树的Redux store
 * 更改store中数据的唯一方法是对其调用`dispatch（）`。
 *
 * 你的app中应该只有一个store。为了指定state tree的不同部分如何响应actions，
 * 你可以使用`combineReducers`方法将多个reducer组合为单个reducer函数。
 *
 * @param reducer A function that returns the next state tree, given
 * the current state tree and the action to handle.
 *
 * 一个返回新state tree的函数，参数为当前state tree和要处理的action。
 *
 * @param preloadedState The initial state. You may optionally specify it
 * to hydrate the state from the server in universal apps, or to restore a
 * previously serialized user session.
 * If you use `combineReducers` to produce the root reducer function, this must be
 * an object with the same shape as `combineReducers` keys.
 *
 * state初始值。 在同构应用中可以和服务器端给定的state结合，或用作还原修改过的状态。
 * 如果您使用 `combineReducers` 合并生成的root reducer函数，则preloadedState数据对象必须是与 `combineReducers` 具有相同key。
 *
 * @param enhancer The store enhancer. You may optionally specify it
 * to enhance the store with third-party capabilities such as middleware,
 * time travel, persistence, etc. The only store enhancer that ships with Redux
 * is `applyMiddleware()`.
 *
 * 提供的store增强插口。 您可以通过他来增加一些三方功能，例如中间件，时间穿梭，持久化等。
 * Redux提供了一个store enhancer是 `applyMiddleware()`。
 *
 * @returns A Redux store that lets you read the state, dispatch actions
 * and subscribe to changes.
 *
 * 返回 Redux store，可让您读取state，dispatch actions并订阅数据更改。
 */
export default function createStore<
  S,
  A extends Action,
  Ext = {},
  StateExt = never
>(
  reducer: Reducer<S, A>,
  enhancer?: StoreEnhancer<Ext, StateExt>
): Store<ExtendState<S, StateExt>, A, StateExt, Ext> & Ext

export default function createStore<
  S,
  A extends Action,
  Ext = {},
  StateExt = never
>(
  reducer: Reducer<S, A>,
  preloadedState?: PreloadedState<S>,
  enhancer?: StoreEnhancer<Ext, StateExt>
): Store<ExtendState<S, StateExt>, A, StateExt, Ext> & Ext

export default function createStore<
  S,
  A extends Action,
  Ext = {},
  StateExt = never
>(
  reducer: Reducer<S, A>,
  preloadedState?: PreloadedState<S> | StoreEnhancer<Ext, StateExt>,
  enhancer?: StoreEnhancer<Ext, StateExt>
): Store<ExtendState<S, StateExt>, A, StateExt, Ext> & Ext {
  /**
   * 参数错误处理
   */
  if (
    (typeof preloadedState === 'function' && typeof enhancer === 'function') ||
    (typeof enhancer === 'function' && typeof arguments[3] === 'function')
  ) {
    throw new Error(
      'It looks like you are passing several store enhancers to ' +
        'createStore(). This is not supported. Instead, compose them ' +
        'together to a single function.'
    )
  }

  /**
   * js实现函数重载的常规方式
   * 处理没传preloadedState参数的情况
   **/
  if (typeof preloadedState === 'function' && typeof enhancer === 'undefined') {
    enhancer = preloadedState as StoreEnhancer<Ext, StateExt>
    preloadedState = undefined
  }

  if (typeof enhancer !== 'undefined') {
    if (typeof enhancer !== 'function') {
      throw new Error('Expected the enhancer to be a function.')
    }

    /**
     * reudx增强的实现
     * 使用pipe的思想
     * 将createStore函数和调用参数都返回出去交由第三方接管，然后三方插件再调用 createStore(reducer, preloadedState) 执行后面的逻辑;
     * 多个enhancer  需要通过redux提供的 `compose()` 将列表形式处理成 pipe 结构的方法
     * 比如 redux-devtools-extension 这个插件，他会将每一次action 以及状态记录下来，以实现调试时的时间穿梭等功能
     */
    return enhancer(createStore)(
      reducer,
      preloadedState as PreloadedState<S>
    ) as Store<ExtendState<S, StateExt>, A, StateExt, Ext> & Ext
  }

  if (typeof reducer !== 'function') {
    throw new Error('Expected the reducer to be a function.')
  }

  let currentReducer = reducer
  let currentState = preloadedState as S
  let currentListeners: (() => void)[] | null = []
  let nextListeners = currentListeners
  let isDispatching = false

  /**
   * This makes a shallow copy of currentListeners so we can use
   * nextListeners as a temporary list while dispatching.
   *
   * This prevents any bugs around consumers calling
   * subscribe/unsubscribe in the middle of a dispatch.
   *
   * 将currentListeners浅拷贝给nextListeners，因此在dispatch时可以将nextListeners用作临时存储列表。
   * 这样可以避免dispatch过程中consumers在调用订阅/取消订阅时出现错误。
   */
  function ensureCanMutateNextListeners() {
    // 确保nextListeners和currentListeners不是同一个引用
    if (nextListeners === currentListeners) {
      // 如果是同一个引用，则浅拷贝currentListeners到nextListeners
      nextListeners = currentListeners.slice()
    }
  }

  /**
   * Reads the state tree managed by the store.
   *
   * @returns The current state tree of your application.
   */
  function getState(): S {
    if (isDispatching) {
      throw new Error(
        'You may not call store.getState() while the reducer is executing. ' +
          'The reducer has already received the state as an argument. ' +
          'Pass it down from the top reducer instead of reading it from the store.'
      )
    }

    return currentState as S
  }

  /**
   * Adds a change listener. It will be called any time an action is dispatched,
   * and some part of the state tree may potentially have changed. You may then
   * call `getState()` to read the current state tree inside the callback.
   *
   * 添加更改 `listener` 。 每当dispatch action时，都会调用它，并且state tree的某些部分可能已更改。
   * 您可以调用`getState（）`来读取回调中的当前state tree。
   *
   * You may call `dispatch()` from a change listener, with the following
   * caveats:
   *
   * 1. The subscriptions are snapshotted just before every `dispatch()` call.
   * If you subscribe or unsubscribe while the listeners are being invoked, this
   * will not have any effect on the `dispatch()` that is currently in progress.
   * However, the next `dispatch()` call, whether nested or not, will use a more
   * recent snapshot of the subscription list.
   *
   * 2. The listener should not expect to see all state changes, as the state
   * might have been updated multiple times during a nested `dispatch()` before
   * the listener is called. It is, however, guaranteed that all subscribers
   * registered before the `dispatch()` started will be called with the latest
   * state by the time it exits.
   *
   * 您可以从变更`listener`调用`dispatch（）`，但要注意以下几点：
   * 1. 订阅在每个`dispatch（）`调用之前被快照。
   * 如果您在`listener`被调用时订阅或取消订阅，这对当前正在进行的`dispatch（）`不会产生任何影响。
   * 但是，下一个`dispatch（）`调用，无论是否嵌套，都将使用订阅列表的最新快照。
   * 2. 侦听器不应期望看到所有状态更改，因为在调用侦听器之前，该状态可能
   * 已在嵌套的`dispatch（）`期间多次更新。 所以只要确保在`dispatch（）`退出时
   * 所有启动之前注册的listener将以最新 state 被调用。
   *
   * @param listener A callback to be invoked on every dispatch.
   * @returns A function to remove this change listener.
   */
  function subscribe(listener: () => void) {
    if (typeof listener !== 'function') {
      throw new Error('Expected the listener to be a function.')
    }

    if (isDispatching) {
      throw new Error(
        'You may not call store.subscribe() while the reducer is executing. ' +
          'If you would like to be notified after the store has been updated, subscribe from a ' +
          'component and invoke store.getState() in the callback to access the latest state. ' +
          'See https://redux.js.org/api-reference/store#subscribelistener for more details.'
      )
    }

    let isSubscribed = true

    ensureCanMutateNextListeners()
    nextListeners.push(listener)

    return function unsubscribe() {
      if (!isSubscribed) {
        return
      }

      if (isDispatching) {
        throw new Error(
          'You may not unsubscribe from a store listener while the reducer is executing. ' +
            'See https://redux.js.org/api-reference/store#subscribelistener for more details.'
        )
      }

      isSubscribed = false

      ensureCanMutateNextListeners()
      const index = nextListeners.indexOf(listener)
      nextListeners.splice(index, 1)
      currentListeners = null
    }
  }

  /**
   * Dispatches an action. It is the only way to trigger a state change.
   *
   * dispatch action。这是触发状态更改的唯一方法。
   *
   * The `reducer` function, used to create the store, will be called with the
   * current state tree and the given `action`. Its return value will
   * be considered the **next** state of the tree, and the change listeners
   * will be notified.
   *
   * 使用当前state tree和给定的 `action` 一起调用创建store时的 `reducer` 函数。
   * 它的返回值将被视为state tree的 **下一个** state，并且将通知 更改listener
   *
   * The base implementation only supports plain object actions. If you want to
   * dispatch a Promise, an Observable, a thunk, or something else, you need to
   * wrap your store creating function into the corresponding middleware. For
   * example, see the documentation for the `redux-thunk` package. Even the
   * middleware will eventually dispatch plain object actions using this method.
   *
   * 基本实现仅支持纯对象操作（也就是同步操作）。 如果要调度Promise，Observable，thunk
   * 或其他，则需要在创建store时将相应的中间件包装进去。 例如，可以看看`redux-thunk`的文档。
   * 中间件最终也都使用此方法dispatch纯对象操作。
   *
   * @param action A plain object representing “what changed”. It is
   * a good idea to keep actions serializable so you can record and replay user
   * sessions, or use the time travelling `redux-devtools`. An action must have
   * a `type` property which may not be `undefined`. It is a good idea to use
   * string constants for action types.
   *
   * @param action  一个纯对象，表示 “要修改啥”。 保持操作的可序列化，这样您就可以记录
   * 和重现用户动作会话，或使用时间旅行`redux-devtools`工具。 动作必须具有`type`属性，
   * 该属性不能为`undefined`。 最好action type使用字符串常量。
   *
   * @returns For convenience, the same action object you dispatched.
   * @returns 为方便起见，dispatch将直接原样返回action参数
   *
   * Note that, if you use a custom middleware, it may wrap `dispatch()` to
   * return something else (for example, a Promise you can await).
   *
   * 请注意，如果使用了自定义中间件，则有可能会包装`dispatch（）`然后返回其他内容
   * （例如，Promise）。
   */
  function dispatch(action: A) {
    if (!isPlainObject(action)) {
      throw new Error(
        'Actions must be plain objects. ' +
          'Use custom middleware for async actions.'
      )
    }

    if (typeof action.type === 'undefined') {
      throw new Error(
        'Actions may not have an undefined "type" property. ' +
          'Have you misspelled a constant?'
      )
    }

    if (isDispatching) {
      throw new Error('Reducers may not dispatch actions.')
    }

    try {
      isDispatching = true
      // 调用当前action type对应的reducer 方法，返回新的state
      // 这就是dispatch一个action可以改变全局state的原因
      currentState = currentReducer(currentState, action)
    } finally {
      isDispatching = false
    }

    // 执行所有注册的listener 这儿就是 react-redux connect 更新UI视图的调用执行地方
    const listeners = (currentListeners = nextListeners)
    for (let i = 0; i < listeners.length; i++) {
      const listener = listeners[i]
      listener()
    }

    return action
  }

  /**
   * Replaces the reducer currently used by the store to calculate the state.
   *
   * 替换store当前用于处理state的reducer。
   *
   * You might need this if your app implements code splitting and you want to
   * load some of the reducers dynamically. You might also need this if you
   * implement a hot reloading mechanism for Redux.
   *
   * 如果您的应用实现了代码拆分，并且您想加载一些动态reducers，则需要此方法。
   * Redux的热加载机制需要使用此功能
   * 这个方法不太常用
   *
   * @param nextReducer The reducer for the store to use instead.
   * @param nextReducer store使用的reducer
   * @returns The same store instance with a new reducer in place.
   * @returns 具有新的reducer 的store实例
   */
  function replaceReducer<NewState, NewActions extends A>(
    nextReducer: Reducer<NewState, NewActions>
  ): Store<ExtendState<NewState, StateExt>, NewActions, StateExt, Ext> & Ext {
    if (typeof nextReducer !== 'function') {
      throw new Error('Expected the nextReducer to be a function.')
    }

    // TODO: do this more elegantly
    ;((currentReducer as unknown) as Reducer<
      NewState,
      NewActions
    >) = nextReducer

    // This action has a similar effect to ActionTypes.INIT.
    // Any reducers that existed in both the new and old rootReducer
    // will receive the previous state. This effectively populates
    // the new state tree with any relevant data from the old one.

    // 此操作具有与ActionTypes.INIT类似的效果。发送一个dispatch初始化state，表明一下是REPLACE
    // 可以将旧state tree所有数据填充到新的rootReducer
    dispatch({ type: ActionTypes.REPLACE } as A)
    // change the type of the store by casting it to the new store
    return (store as unknown) as Store<
      ExtendState<NewState, StateExt>,
      NewActions,
      StateExt,
      Ext
    > &
      Ext
  }

  /**
   * Interoperability point for observable/reactive libraries.
   * @returns A minimal observable of state changes.
   * For more information, see the observable proposal:
   * https://github.com/tc39/proposal-observable
   *
   * 实现与observable/reactive库类似效果
   * 返回一个最小变化的可观察state
   * 更多请参考 https://github.com/tc39/proposal-observable
   */
  function observable() {
    const outerSubscribe = subscribe
    return {
      /**
       * The minimal observable subscription method.
       * @param observer Any object that can be used as an observer.
       * The observer object should have a `next` method.
       * @returns An object with an `unsubscribe` method that can
       * be used to unsubscribe the observable from the store, and prevent further
       * emission of values from the observable.
       */
      subscribe(observer: unknown) {
        if (typeof observer !== 'object' || observer === null) {
          throw new TypeError('Expected the observer to be an object.')
        }

        function observeState() {
          const observerAsObserver = observer as Observer<S>
          if (observerAsObserver.next) {
            observerAsObserver.next(getState())
          }
        }

        observeState()
        const unsubscribe = outerSubscribe(observeState)
        return { unsubscribe }
      },

      [$$observable]() {
        return this
      }
    }
  }

  // When a store is created, an "INIT" action is dispatched so that every
  // reducer returns their initial state. This effectively populates
  // the initial state tree.
  //
  // 调用ActionTypes.INIT 初始化 store
  dispatch({ type: ActionTypes.INIT } as A)

  const store = ({
    dispatch: dispatch as Dispatch<A>,
    subscribe,
    getState,
    replaceReducer,
    [$$observable]: observable
  } as unknown) as Store<ExtendState<S, StateExt>, A, StateExt, Ext> & Ext
  return store
}
