export default defineAppConfig({
  pages: ['pages/entry/index', 'pages/home/index', 'pages/tasks/index', 'pages/shop/index', 'pages/me/index'],
  subPackages: [
    { root: 'packages/account', pages: ['binding/index', 'rules/index', 'history/index', 'milestones/index', 'appearance/index', 'points/index', 'partner/index', 'gift/index', 'gift-detail/index', 'messages/index', 'message-detail/index', 'notification-settings/index', 'notification-template/index'] },
    { root: 'packages/commerce', pages: ['store/index', 'product-edit/index', 'product/index', 'checkout/index', 'orders/index', 'order-detail/index'] },
    { root: 'packages/tasks', pages: ['edit/index', 'detail/index'] },
  ],
  darkmode: true,
  themeLocation: 'theme.json',
  window: {
    navigationBarTitleText: '情侣小店',
    navigationBarBackgroundColor: process.env.TARO_ENV === 'weapp' ? '@page' : '#F6F7FC',
    navigationBarTextStyle: process.env.TARO_ENV === 'weapp' ? '@navText' : 'black',
    backgroundColor: process.env.TARO_ENV === 'weapp' ? '@page' : '#F6F7FC',
  },
  tabBar: {
    color: process.env.TARO_ENV === 'weapp' ? '@muted' : '#71677E',
    selectedColor: process.env.TARO_ENV === 'weapp' ? '@primary' : '#6752A3',
    backgroundColor: process.env.TARO_ENV === 'weapp' ? '@surface' : '#FFFFFF',
    borderStyle: 'black',
    list: [
      { pagePath: 'pages/home/index', text: '首页', iconPath: process.env.TARO_ENV === 'weapp' ? '@homeIcon' : 'assets/tab-icons/home-iris-light.png', selectedIconPath: process.env.TARO_ENV === 'weapp' ? '@homeActive' : 'assets/tab-icons/home-iris-light-active.png' },
      { pagePath: 'pages/tasks/index', text: '任务', iconPath: process.env.TARO_ENV === 'weapp' ? '@tasksIcon' : 'assets/tab-icons/tasks-iris-light.png', selectedIconPath: process.env.TARO_ENV === 'weapp' ? '@tasksActive' : 'assets/tab-icons/tasks-iris-light-active.png' },
      { pagePath: 'pages/shop/index', text: '购物', iconPath: process.env.TARO_ENV === 'weapp' ? '@shopIcon' : 'assets/tab-icons/shop-iris-light.png', selectedIconPath: process.env.TARO_ENV === 'weapp' ? '@shopActive' : 'assets/tab-icons/shop-iris-light-active.png' },
      { pagePath: 'pages/me/index', text: '我的', iconPath: process.env.TARO_ENV === 'weapp' ? '@meIcon' : 'assets/tab-icons/me-iris-light.png', selectedIconPath: process.env.TARO_ENV === 'weapp' ? '@meActive' : 'assets/tab-icons/me-iris-light-active.png' },
    ],
  },
})
