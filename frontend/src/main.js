import { createApp } from 'vue'
import axios from 'axios'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import './style.css'
import App from './App.vue'
import router from './router'
import { useUserStore } from './stores/user'
import { initTheme } from './utils/theme'

axios.defaults.baseURL = import.meta.env.VITE_API_BASE || ''

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(ElementPlus)
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
	return config
})

axios.interceptors.response.use(
	(response) => response,
	(error) => {
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