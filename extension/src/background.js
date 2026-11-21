// @ts-check
/* Background: desktop notifications + opening the settings page. */
browser.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "notify") {
    const id = `cmc-${sender.tab ? sender.tab.id : 0}-${Date.now()}`;
    browser.notifications.create(id, {
      type: "basic",
      iconUrl: browser.runtime.getURL("icons/icon-96.png"),
      title: msg.title,
      message: msg.message,
    });
  } else if (msg.type === "openOptions") {
    browser.runtime.openOptionsPage();
  }
});

// Clicking a notification jumps back to the tab it came from.
browser.notifications.onClicked.addListener((id) => {
  const tabId = parseInt(id.split("-")[1], 10);
  if (!tabId) return;
  browser.tabs.update(tabId, { active: true }).then((t) => {
    if (t.windowId != null) browser.windows.update(t.windowId, { focused: true });
  });
});
