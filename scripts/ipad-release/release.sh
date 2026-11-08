#!/bin/zsh
# Build and upload a personal-team iPad build to TestFlight.
# Requires: Xcode signed in to your team, repo-root .env (copy of .env.example),
# and scripts/ipad-release/.env.ipad (copy of .env.ipad.example).
set -e
HERE=${0:A:h}
REPO=${HERE:h:h}
[[ -f $HERE/.env.ipad ]] || { echo "missing $HERE/.env.ipad (see .env.ipad.example)"; exit 1; }
set -a; source $HERE/.env.ipad; set +a
: ${T3CODE_IOS_TEAM_ID:?} ${T3CODE_IOS_PERSONAL_TEAM_BUNDLE_ID:?}
OUT=${OUT:-$HOME/Library/Caches/t3code-ipad-release}
mkdir -p $OUT
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer} EXPO_NO_GIT_STATUS=1
export T3CODE_IOS_PERSONAL_TEAM=1 APP_VARIANT=production
cat > $OUT/ExportOptions.plist <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>method</key><string>app-store-connect</string>
<key>destination</key><string>upload</string>
<key>teamID</key><string>$T3CODE_IOS_TEAM_ID</string>
<key>signingStyle</key><string>automatic</string>
<key>manageAppVersionAndBuildNumber</key><true/>
<key>testFlightInternalTestingOnly</key><true/>
<key>uploadSymbols</key><true/>
</dict></plist>
PLIST
cd $REPO/apps/mobile
echo "== config"; npx expo config --json 2>/dev/null | node -e 'const c=JSON.parse(require("fs").readFileSync(0));if(!c.extra.clerk.publishableKey){console.error("missing repo-root .env (Clerk key)");process.exit(1)}console.log("bundle:",c.ios.bundleIdentifier,"relay:",c.extra.relay.url)'
echo "== prebuild"; npx expo prebuild --clean --platform ios > $OUT/prebuild.log 2>&1
rm -rf $OUT/T3Code.xcarchive $OUT/export
echo "== archive"; xcodebuild archive -workspace ios/T3Code.xcworkspace -scheme T3Code -configuration Release -destination 'generic/platform=iOS' -archivePath $OUT/T3Code.xcarchive -allowProvisioningUpdates DEVELOPMENT_TEAM=$T3CODE_IOS_TEAM_ID CODE_SIGN_STYLE=Automatic > $OUT/archive.log 2>&1 || { tail -30 $OUT/archive.log; exit 1; }
echo "== upload"; xcodebuild -exportArchive -archivePath $OUT/T3Code.xcarchive -exportOptionsPlist $OUT/ExportOptions.plist -exportPath $OUT/export -allowProvisioningUpdates > $OUT/export.log 2>&1 || true
grep -E "Upload succeeded|EXPORT (SUCCEEDED|FAILED)|^error" $OUT/export.log
