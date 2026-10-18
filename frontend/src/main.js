import { createApp } from 'vue'
import axios from 'axios'
import { createPinia } from 'pinia'
import { ElButton, ElDialog, ElInput } from 'element-plus'
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/dialog/style/css'
import 'element-plus/es/components/input/style/css'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import './style.css'
import './styles/portal.css'
import './styles/invitation.css'
import './styles/motion.css'
import './styles/scrollMotion.css'
import App from './App.vue'
import router from './router'
import { useUserStore } from './stores/user'
import { initTheme } from './utils/theme'

axios.defaults.baseURL = import.meta.env.VITE_API_BASE || ''

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(ElButton)
app.use(ElDialog)
app.use(ElInput)
app.use(router)

initTheme()

const userStore = useUserStore(pinia)
userStore.initFromStorage()

axios.interceptors.request.use((config) => {
	const token = userStore.token
	if (token) {
		config.headers = config.headers || {}
		if (!config.headers.Authorization) {
			config.headers.Authorization = `Bearer ${token}`
		}
	}
	window.dispatchEvent(new CustomEvent('route-progress:request-start'))
	return config
})

axios.interceptors.response.use(
	(response) => {
		window.dispatchEvent(new CustomEvent('route-progress:request-end'))
		return response
	},
	(error) => {
		window.dispatchEvent(new CustomEvent('route-progress:request-end'))
		if (error?.response?.status === 401) {
			userStore.clearAuth()
			if (router.currentRoute.value.path !== '/login') {
				router.push('/login')
			}
		}
		return Promise.reject(error)
	}
)

app.mount('#app')
