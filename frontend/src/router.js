import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from './stores/user'
const Home = () => import('./views/public/Home.vue')
const Activities = () => import('./views/public/Activities.vue')
const ActivityDetail = () => import('./views/public/ActivityDetail.vue')
const Members = () => import('./views/public/Members.vue')
const History = () => import('./views/public/History.vue')
const SocialLink = () => import('./views/public/SocialLink.vue')
const Join = () => import('./views/public/Join.vue')
const Login = () => import('./views/public/Login.vue')
const PublicLogs = () => import('./views/public/Logs.vue')
const AdminLayout = () => import('./layouts/AdminLayout.vue')
const AdminActivities = () => import('./views/admin/Activities.vue')
const AdminMembers = () => import('./views/admin/Members.vue')
const AdminHistory = () => import('./views/admin/History.vue')
const AdminConfig = () => import('./views/admin/Config.vue')
const AdminHomeLinks = () => import('./views/admin/HomeLinks.vue')
const AdminLogs = () => import('./views/admin/Logs.vue')
const AdminProfile = () => import('./views/admin/Profile.vue')
const AdminUsers = () => import('./views/admin/Users.vue')
const AdminBackups = () => import('./views/admin/Backups.vue')

const routes = [
  { 
    path: '/', 
    name: 'Home', 
    component: Home,
    meta: {
      title: '首页',
      description: '桂航绯想天首页，聚合最新群活动、公告与社群动态。'
    }
  },
  { 
    path: '/activities', 
    name: 'Activities', 
    component: Activities,
    meta: {
      title: '近期群活',
      description: '查看近期群活动安排与详情。'
    }
  },
  { 
    path: '/activity/:id', 
    name: 'ActivityDetail', 
    component: ActivityDetail,
    meta: {
      title: '群活动详情',
      description: '查看群活动的详细内容、时间与相关信息。'
    }
  },
  { 
    path: '/members', 
    name: 'Members', 
    component: Members,
    meta: {
      title: '绯想天住民',
      description: '了解社群成员与相关资料。'
    }
  },
  { 
    path: '/history', 
    name: 'History', 
    component: History,
    meta: {
      title: '绯想天群史',
      description: '回顾社群发展历程与重要节点。'
    }
  },
  { 
    path: '/social', 
    name: 'SocialLink', 
    component: SocialLink,
    meta: {
      title: '博丽大结界',
      description: '社群对外社交与友情链接信息。'
    }
  },
  { 
    path: '/join', 
    name: 'Join', 
    component: Join,
    meta: {
      title: '加入我们',
      description: '加入桂航绯想天同好会，了解入群方式与规则。'
    }
  }, // 新增路由
  { 
    path: '/login', 
    name: 'Login', 
    component: Login,
    meta: {
      title: '登录',
      description: '管理员登录入口。',
      robots: 'noindex, nofollow'
    }
  },
  { 
    path: '/logs', 
    name: 'PublicLogs', 
    component: PublicLogs,
    meta: {
      title: '站点日志',
      description: '公开的站点变更与日志信息。'
    }
  },
  {
    path: '/admin',
    component: AdminLayout,
    meta: {
      robots: 'noindex, nofollow',
      disableRouteProgress: true
    },
    redirect: '/admin/activities',
    beforeEnter: (to, from, next) => {
      const store = useUserStore()
      if (!store.isLoggedIn) store.initFromStorage()
      if (store.isLoggedIn) next()
      else next('/login')
    },
    children: [
      { path: 'activities', name: 'AdminActivities', component: AdminActivities },
      { path: 'history', name: 'AdminHistory', component: AdminHistory },
      { path: 'members', name: 'AdminMembers', component: AdminMembers },
      { path: 'logs', name: 'AdminLogs', component: AdminLogs },
      { path: 'home-links', name: 'AdminHomeLinks', component: AdminHomeLinks },
      { path: 'config', name: 'AdminConfig', component: AdminConfig },
      { path: 'profile', name: 'AdminProfile', component: AdminProfile },
      {
        path: 'backups',
        name: 'AdminBackups',
        component: AdminBackups,
        beforeEnter: (to, from, next) => {
          const store = useUserStore()
          if (!store.isLoggedIn) store.initFromStorage()
          if (store.isSuperAdmin) next()
          else next('/admin/activities')
        }
      },
      { 
        path: 'users', 
        name: 'AdminUsers', 
        component: AdminUsers,
        beforeEnter: (to, from, next) => {
          const store = useUserStore()
          if (!store.isLoggedIn) store.initFromStorage()
          if (store.isSuperAdmin) next()
          else next('/admin/activities')
        }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    return savedPosition || { top: 0 }
  }
})

export default router
