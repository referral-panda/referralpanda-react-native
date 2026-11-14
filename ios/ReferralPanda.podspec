require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ReferralPanda'
  s.version        = package['version'].split('-').first
  s.summary        = package['description']
  s.author         = 'ReferralPanda'
  s.homepage       = package['homepage']
  s.license        = package['license'] || 'UNLICENSED'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: package['repository']['url'] }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'StoreKit'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files   = '**/*.swift'
  s.resource_bundles = { 'ReferralPandaPrivacy' => ['PrivacyInfo.xcprivacy'] }
end
