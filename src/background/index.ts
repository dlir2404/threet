import { startDevLink } from './devlink';
import { installUpdateCheck } from './update';

// Clicking the toolbar icon toggles the sheet on the current Threads tab.
chrome.action.onClicked.addListener((tab) => {
  if (tab.id != null) chrome.tabs.sendMessage(tab.id, { type: 'threet:toggle' }).catch(() => {});
});

installUpdateCheck();

if (__DEV__) startDevLink();
