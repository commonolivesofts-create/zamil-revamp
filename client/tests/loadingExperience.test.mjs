import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createElement as h, lazy, Suspense } from 'react'
import { renderToString } from 'react-dom/server'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let vite
let AdminLayout, StartupLoading, ProtectedRoute, AppRouteAccess, AuthContext, PermissionContext

before(async () => {
  vite = await createServer({
    configFile: false,
    envDir: false,
    root: fileURLToPath(new URL('../', import.meta.url)),
    plugins: [react()],
    resolve: { alias: { '@': fileURLToPath(new URL('../src/', import.meta.url)) } },
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    appType: 'custom',
  })
  const modules = await Promise.all([
    vite.ssrLoadModule('/src/layouts/AdminLayout.jsx'),
    vite.ssrLoadModule('/src/components/feedback/StartupLoading.jsx'),
    vite.ssrLoadModule('/src/routes/RouteGuards.jsx'),
    vite.ssrLoadModule('/src/features/auth/AuthContext.js'),
    vite.ssrLoadModule('/src/features/access/PermissionContext.js'),
  ])
  AdminLayout = modules[0].default
  StartupLoading = modules[1].default
  ;({ ProtectedRoute, AppRouteAccess } = modules[2])
  AuthContext = modules[3].AuthContext
  PermissionContext = modules[4].PermissionContext
})

after(async () => {
  await vite?.close()
})

function renderPage({ status = 'authenticated', accessStatus = 'ready', report = false, Page }) {
  const path = `/hr/recruitment/offer${report ? '/report' : ''}`
  const router = createMemoryRouter(
    [
      {
        element: h(ProtectedRoute),
        children: [
          {
            element: h(AdminLayout),
            children: [
              {
                element: h(AppRouteAccess),
                children: [
                  {
                    path,
                    handle: { routeId: report ? 'hr-offer-report' : 'hr-offer' },
                    element: h(Page),
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    { initialEntries: [path] },
  )
  try {
    return renderToString(
      h(
        AuthContext.Provider,
        { value: { status, user: { id: 'test-user' } } },
        h(
          PermissionContext.Provider,
          { value: { status: accessStatus, has: () => true } },
          h(Suspense, { fallback: h(StartupLoading) }, h(RouterProvider, { router })),
        ),
      ),
    )
  } finally {
    router.dispose()
  }
}

test('initial session restoration shows one neutral state without mounting protected content', () => {
  const html = renderPage({
    status: 'loading',
    Page: () => {
      throw new Error('Protected page rendered before authentication')
    },
  })
  assert.match(html, /zrv-startup-loading/)
  assert.match(html, /Loading application/)
  assert.doesNotMatch(
    html,
    /Checking session|Loading workspace|Loading your permissions|id="sidebar"/,
  )
})

test('pending permissions show form skeletons inside the shell without mounting the page', () => {
  const html = renderPage({
    accessStatus: 'loading',
    Page: () => {
      throw new Error('Page rendered before permissions resolved')
    },
  })
  assert.match(html, /id="sidebar"/)
  assert.match(html, /<header/)
  assert.match(html, /<main[^>]*>[\s\S]*zrv-content-skeleton--form[\s\S]*<\/main>/)
  assert.doesNotMatch(html, /zrv-startup-loading|Checking access|Loading your permissions/)
})

test('a suspended report chunk keeps the shell visible and shows a table skeleton in main', () => {
  const PendingPage = lazy(() => new Promise(() => {}))
  const html = renderPage({ report: true, Page: PendingPage })
  assert.match(html, /id="sidebar"/)
  assert.match(html, /<header/)
  assert.match(html, /<main[^>]*>[\s\S]*zrv-content-skeleton--table[\s\S]*<\/main>/)
  assert.doesNotMatch(html, /zrv-startup-loading|Loading workspace/)
})

test('a ready page renders immediately without a route loading indicator', () => {
  const html = renderPage({ Page: () => h('h1', null, 'Employment offer ready') })
  assert.match(html, /Employment offer ready/)
  assert.doesNotMatch(html, /zrv-route-loading|zrv-startup-loading/)
})
