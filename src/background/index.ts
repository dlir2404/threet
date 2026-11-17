import { startDevLink } from './devlink';

// Clicking the toolbar icon toggles the sheet on the current Threads tab.
chrome.action.onClicked.addListener((tab) => {
  if (tab.id != null) chrome.tabs.sendMessage(tab.id, { type: 'threet:toggle' }).catch(() => {});
});

if (__DEV__) startDevLink();
