// Website links open the app only once the final domain serves its assetlinks.json. Until then the famsync:// links work.
module.exports = ({ config }) => {
  const host = process.env.FAMSYNC_APP_LINK_HOST;
  const applicationId = process.env.FAMSYNC_ANDROID_APPLICATION_ID;
  const googleServicesFile = process.env.FAMSYNC_GOOGLE_SERVICES_FILE;
  if (googleServicesFile && !applicationId) throw new Error('Set FAMSYNC_ANDROID_APPLICATION_ID to the Firebase Android application ID.');
  const android = { ...config.android, ...(applicationId ? { package: applicationId } : {}), ...(googleServicesFile ? { googleServicesFile } : {}) };
  if (host) {
    const data = ["/join", "/join-channel", "/auth/callback"].map((pathPrefix) => ({ scheme: "https", host, pathPrefix }));
    android.intentFilters = [{ action: "VIEW", autoVerify: true, data, category: ["BROWSABLE", "DEFAULT"] }];
  }
  return { ...config, android, plugins: [...(config.plugins ?? []), ['expo-notifications', { defaultChannel: 'famsync-updates', icon: './assets/notification.png', color: '#58725f' }], ['expo-audio', { recordAudioAndroid: true, enableBackgroundPlayback: false, enableBackgroundRecording: false }], ['expo-video', { supportsBackgroundPlayback: false, supportsPictureInPicture: false }]] };
};
