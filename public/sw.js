self.addEventListener("push", (event) => {
  const payload = event.data
    ? event.data.json()
    : {
        title: "MyStoreQR",
        body: "주문 상태가 업데이트되었습니다.",
        url: "/track",
      }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      data: {
        url: payload.url || "/track",
      },
    })
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()

  const url = event.notification.data?.url || "/track"
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const matchedClient = clients.find((client) => client.url.includes(url))
      if (matchedClient) {
        return matchedClient.focus()
      }

      return self.clients.openWindow(url)
    })
  )
})
