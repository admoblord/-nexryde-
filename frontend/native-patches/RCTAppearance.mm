/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

#import "RCTAppearance.h"

#import <FBReactNativeSpec/FBReactNativeSpec.h>
#import <React/RCTConstants.h>
#import <React/RCTEventEmitter.h>
#import <React/RCTConvert.h>

#import "CoreModulesPlugins.h"

using namespace facebook::react;

NSString *const RCTAppearanceColorSchemeLight = @"light";
NSString *const RCTAppearanceColorSchemeDark = @"dark";

static BOOL sAppearancePreferenceEnabled = YES;
void RCTEnableAppearancePreference(BOOL enabled)
{
  sAppearancePreferenceEnabled = enabled;
}

static NSString *sColorSchemeOverride = nil;
void RCTOverrideAppearancePreference(NSString *const colorSchemeOverride)
{
  sColorSchemeOverride = colorSchemeOverride;
}

static BOOL sUseKeyWindowForSystemStyle = NO;
void RCTUseKeyWindowForSystemStyle(BOOL useMainScreen)
{
  sUseKeyWindowForSystemStyle = useMainScreen;
}

NSString *RCTCurrentOverrideAppearancePreference()
{
  return sColorSchemeOverride;
}

NSString *RCTColorSchemePreference(UITraitCollection *traitCollection)
{
  static NSDictionary *appearances;
  static dispatch_once_t onceToken;

  if (sColorSchemeOverride) {
    return sColorSchemeOverride;
  }

  dispatch_once(&onceToken, ^{
    appearances = @{
      @(UIUserInterfaceStyleLight) : RCTAppearanceColorSchemeLight,
      @(UIUserInterfaceStyleDark) : RCTAppearanceColorSchemeDark
    };
  });

  if (!sAppearancePreferenceEnabled) {
    // Return the default if the app doesn't allow different color schemes.
    return RCTAppearanceColorSchemeLight;
  }

  if (!traitCollection) {
    traitCollection = [UITraitCollection currentTraitCollection];
  }

  UIUserInterfaceStyle systemStyle = sUseKeyWindowForSystemStyle ? RCTKeyWindow().traitCollection.userInterfaceStyle
                                                                 : traitCollection.userInterfaceStyle;

  return appearances[@(systemStyle)] ?: RCTAppearanceColorSchemeLight;
}

@interface RCTAppearance () <NativeAppearanceSpec>
@end

@implementation RCTAppearance {
  NSString *_currentColorScheme;
}

- (instancetype)init
{
  if ((self = [super init])) {
    UITraitCollection *traitCollection = RCTKeyWindow().traitCollection;
    _currentColorScheme = RCTColorSchemePreference(traitCollection);
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(appearanceChanged:)
                                                 name:RCTUserInterfaceStyleDidChangeNotification
                                               object:nil];
  }
  return self;
}

RCT_EXPORT_MODULE(Appearance)

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (dispatch_queue_t)methodQueue
{
  return dispatch_get_main_queue();
}

- (std::shared_ptr<TurboModule>)getTurboModule:(const ObjCTurboModule::InitParams &)params
{
  return std::make_shared<NativeAppearanceSpecJSI>(params);
}

RCT_EXPORT_METHOD(setColorScheme : (NSString *)style)
{
  // NexRydeAppearancePatch/v1
  // New Architecture: TurboModule void methods may run off the main queue.
  // UIWindow.overrideUserInterfaceStyle must run on main; catch NSException.
  NSString *styleCopy = [style copy];
  dispatch_async(dispatch_get_main_queue(), ^{
    @try {
      UIUserInterfaceStyle userInterfaceStyle = [RCTConvert UIUserInterfaceStyle:styleCopy];
      NSMutableArray<UIWindow *> *windows = [NSMutableArray new];
      UIApplication *application = RCTSharedApplication();
      if (application == nil) {
        return;
      }
      for (UIScene *scene in application.connectedScenes) {
        if (![scene isKindOfClass:[UIWindowScene class]]) {
          continue;
        }
        [windows addObjectsFromArray:((UIWindowScene *)scene).windows];
      }
      for (UIWindow *window in windows) {
        if (window != nil) {
          window.overrideUserInterfaceStyle = userInterfaceStyle;
        }
      }
    } @catch (NSException *exception) {
      NSLog(@"%@ TurboModule Exception: Appearance.setColorScheme(%@) — %@ / %@",
            @"NexRydeAppearancePatch/v1",
            styleCopy,
            exception.name,
            exception.reason);
    }
  });
}

RCT_EXPORT_SYNCHRONOUS_TYPED_METHOD(NSString *, getColorScheme)
{
  return _currentColorScheme;
}

- (void)appearanceChanged:(NSNotification *)notification
{
  NSDictionary *userInfo = [notification userInfo];
  UITraitCollection *traitCollection = nil;
  if (userInfo) {
    traitCollection = userInfo[RCTUserInterfaceStyleDidChangeNotificationTraitCollectionKey];
  }
  NSString *newColorScheme = RCTColorSchemePreference(traitCollection);
  if (![_currentColorScheme isEqualToString:newColorScheme]) {
    _currentColorScheme = newColorScheme;
    [self sendEventWithName:@"appearanceChanged" body:@{@"colorScheme" : newColorScheme}];
  }
}

#pragma mark - RCTEventEmitter

- (NSArray<NSString *> *)supportedEvents
{
  return @[ @"appearanceChanged" ];
}

- (void)invalidate
{
  [super invalidate];
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}

@end

Class RCTAppearanceCls(void)
{
  return RCTAppearance.class;
}
