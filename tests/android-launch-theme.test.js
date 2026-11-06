const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

test('Android cold-start, window, and WebView use the app background', () => {
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'android-app/android/app/src/main/res/values/styles.xml'), 'utf8');
  const activity = fs.readFileSync(path.join(root, 'android-app/android/app/src/main/java/com/example/japanesecards/MainActivity.java'), 'utf8');
  const background = /:root\s*\{[^}]*background:\s*(#[\da-f]{6})/i.exec(css)?.[1].toLowerCase();
  assert.equal(background, '#f7f6f2');
  const launch = /<style name="AppTheme\.NoActionBarLaunch"[^>]*>([\s\S]*?)<\/style>/.exec(styles)?.[1];
  const normal = /<style name="AppTheme\.NoActionBar"[^>]*>([\s\S]*?)<\/style>/.exec(styles)?.[1];
  assert(launch && normal, 'Expected both Android themes');
  assert(launch.includes(`<item name="android:windowBackground">${background}</item>`));
  assert(launch.includes(`<item name="windowSplashScreenBackground">${background}</item>`));
  assert(launch.includes('<item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>'));
  assert(normal.includes(`<item name="android:windowBackground">${background}</item>`));
  assert.match(activity, /Color\.rgb\(247, 246, 242\)/);
  assert(activity.indexOf('SplashScreen.installSplashScreen(this)') < activity.indexOf('super.onCreate(savedInstanceState)'));
  assert.match(activity, /getWebView\(\)\.setBackgroundColor\(APP_BACKGROUND\)/);
});
