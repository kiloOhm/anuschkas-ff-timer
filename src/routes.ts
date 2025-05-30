import { createWebHistory, createRouter, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
    { path: '/', component: () => import('./pages/Index.vue') },
    { path: '/remote/:sessionid', component: () => import('./pages/Remote.vue') },
]

export const router = createRouter({
    history: createWebHistory(),
    routes,
})