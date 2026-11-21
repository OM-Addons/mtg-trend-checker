// @ts-check
/* Background: opens the settings page when asked by a content script. */
browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === "openOptions") browser.runtime.openOptionsPage();
});
