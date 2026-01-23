import { defineStore } from 'pinia'

export const useUserStore = defineStore('user', {
  state: () => ({
    token: '',
    username: '',
    role: '',
    avatar: ''
  }),
  getters: {
    isLoggedIn: (state) => !!state.token,
    isSuperAdmin: (state) => state.role === 'super_admin'
  },
  actions: {
    setCookie(key, value, days = 30) {
      const expires = new Date(Date.now() + days * 864e5).toUTCString()
      document.cookie = `${key}=${encodeURIComponent(value || '')}; Expires=${expires}; Path=/; SameSite=Lax`
    },
    getCookie(key) {
      const match = document.cookie.match(new RegExp(`(?:^|; )${key}=([^;]*)`))
      return match ? decodeURIComponent(match[1]) : ''
    },
    removeCookie(key) {
      document.cookie = `${key}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax`
    },
    initFromStorage() {
      this.token = localStorage.getItem('token') || ''
      this.username = localStorage.getItem('user') || ''
      this.role = localStorage.getItem('role') || ''
      this.avatar = localStorage.getItem('avatar') || ''
      if (!this.token) {
        const token = this.getCookie('token')
        if (token) {
          this.setAuth({
            token,
            username: this.getCookie('user'),
            role: this.getCookie('role'),
            avatar: this.getCookie('avatar')
          })
        }
      }
    },
    setAuth({ token, username, role, avatar }) {
      this.token = token || ''
      this.username = username || ''
      this.role = role || ''
      this.avatar = avatar || ''
      localStorage.setItem('token', this.token)
      localStorage.setItem('user', this.username)
      localStorage.setItem('role', this.role)
      localStorage.setItem('avatar', this.avatar)
      this.setCookie('token', this.token)
      this.setCookie('user', this.username)
      this.setCookie('role', this.role)
      this.setCookie('avatar', this.avatar)
    },
    setAvatar(avatar) {
      this.avatar = avatar || ''
      localStorage.setItem('avatar', this.avatar)
      this.setCookie('avatar', this.avatar)
    },
    clearAuth() {
      this.token = ''
      this.username = ''
      this.role = ''
      this.avatar = ''
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      localStorage.removeItem('role')
      localStorage.removeItem('avatar')
      this.removeCookie('token')
      this.removeCookie('user')
      this.removeCookie('role')
      this.removeCookie('avatar')
    }
  }
})
