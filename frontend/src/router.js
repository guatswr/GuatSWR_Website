import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from './stores/user'

// 基础组件
const Home = () => import('./views/public/Home.vue')
const Activities = () => import('./views/public/Activities.vue')
const ActivityDetail = () => import('./views/public/ActivityDetail.vue')
const Members = () => import('./views/public/Members.vue')
const History = () => import('./views/public/History.vue')
const SocialLink = () => import('./views/public/SocialLink.vue')
const Join = () => import('./views/public/Join.vue')
const Login = () => import('./views/public/Login.vue')
const PublicLogs = () => import('./views/public/Logs.vue')

// --- 异变进行时模块 ---
const EventsLayout = () => import('./layouts/EventsLayout.vue')
const Bounty = () => import('./views/events/Bounty.vue')
const Betting = () => import('./views/events/Betting.vue')
const Stg = () => import('./views/events/Stg.vue')
const Zetime = () => import('./views/events/Zetime.vue')
const Party = () => import('./views/events/Party.vue')

// Admin Components
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
    meta: { title: '首页', description: '桂航绯想天首页' }
  },
  { 
    path: '/activities', 
    name: 'Activities', 
    component: Activities,
    meta: { title: '记忆碎片', description: '往期活动归档' }
  },
  // --- 异变进行时路由 (路径已更新为 /events) ---
  {
    path: '/events', // <--- 修改处
    component: EventsLayout,
    meta: {
      title: '异变进行时',
      description: '查看当前正在进行的活动。'
    },
    redirect: '/events/bounty', // <--- 修改处
    children: [
      {
        path: 'bounty',
        name: 'IncidentBounty',
        component: Bounty,
        meta: { title: '悬赏令' }
      },
      {
        path: 'betting',
        name: 'IncidentBetting',
        component: Betting,
        meta: { title: '对赌协议' }
      },
      {
        path: 'stg',
        name: 'IncidentStg',
        component: Stg,
        meta: { title: 'STG' }
      },
      {
        path: 'zetime',
        name: 'IncidentZetime',
        component: Zetime,
        meta: { title: '则赛' }
      },
      {
        path: 'party',
        name: 'IncidentParty',
        component: Party,
        meta: { title: '聚会' }
      }
    ]
  },
  // -----------------------
  { 
    path: '/activity/:id', 
    name: 'ActivityDetail', 
    component: ActivityDetail,
    meta: { title: '群活动详情' }
  },
  { 
    path: '/members', 
    name: 'Members', 
    component: Members,
    meta: { title: '绯想天住民' }
  },
  { 
    path: '/history', 
    name: 'History', 
    component: History,
    meta: { title: '绯想天群史' }
  },
  { 
    path: '/social', 
    name: 'SocialLink', 
    component: SocialLink,
    meta: { title: '博丽大结界' }
  },
  { 
    path: '/join', 
    name: 'Join', 
    component: Join,
    meta: { title: '加入我们' }
  },
  { 
    path: '/login', 
    name: 'Login', 
    component: Login,
    meta: { title: '登录', robots: 'noindex, nofollow' }
  },
  { 
    path: '/logs', 
    name: 'PublicLogs', 
    component: PublicLogs,
    meta: { title: '站点日志' }
  },
  {
    path: '/admin',
    component: AdminLayout,
    meta: { robots: 'noindex, nofollow', disableRouteProgress: true },
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
    if (savedPosition) return savedPosition
    return { top: 0 }
  }
})

export default router