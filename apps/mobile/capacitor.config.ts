import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // Reverse-domain identifier — becomes the Android package name and the
  // iOS bundle identifier. The `.candidate` suffix reserves room for a
  // future HR-admin or internal-tools build under the same parent. This
  // is the app's identity in Play Store / App Store; renaming after
  // publish is painful, so it's worth getting right at scaffold time.
  appId: "au.com.sentinelhr.candidate",

  // User-visible name on the device home screen and inside the app
  // chrome. The candidate-only scope is encoded in the appId, not here.
  appName: "Sentinel HR",

  // Matches Next's static-export output dir. `npx cap sync` reads from
  // this and copies into android/app/src/main/assets/public (and the
  // iOS equivalent when the iOS platform is added on a Mac).
  webDir: "out",
};

export default config;
