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

const routes = [
  { path: '/', name: 'Home', component: Home },
  { path: '/activities', name: 'Activities', component: Activities },
  { path: '/activity/:id', name: 'ActivityDetail', component: ActivityDetail },
  { path: '/members', name: 'Members', component: Members },
  { path: '/history', name: 'History', component: History },
  { path: '/social', name: 'SocialLink', component: SocialLink },
  { path: '/join', name: 'Join', component: Join }, // 新增路由
  { path: '/login', name: 'Login', component: Login },
  { path: '/logs', name: 'PublicLogs', component: PublicLogs },
  {
    path: '/admin',
    component: AdminLayout,
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
