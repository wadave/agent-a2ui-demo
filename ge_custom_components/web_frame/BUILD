load("//javascript/typescript:build_defs.bzl", "ts_library")
load("//testing/web/build_defs/js_test:js_test_suite.bzl", "js_test_suite")

package(
    default_applicable_licenses = ["//third_party/a2ui:license"],
    default_visibility = [
        "//third_party/a2ui:internal",
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/ui/custom_components:default_visibility",
    ],
)

ts_library(
    name = "web_frame_srcdoc",
    srcs = ["web-frame-srcdoc.ts"],
    use_lit_plugin = True,
    deps = [
        "//javascript/security/safe_content_frame/v2:safe_content_frame",
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/events",
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/types:components",
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/types:primitives",
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/ui:components",
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/ui/context:allowlist",
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/ui/custom_components/web_frame/shared:security_error",
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/ui/utils",
        "//third_party/javascript/lit",
        "//third_party/javascript/lit:context",
    ],
)

ts_library(
    name = "web_frame_url",
    srcs = ["web-frame-url.ts"],
    use_lit_plugin = True,
    deps = [
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/events",
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/types:components",
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/types:primitives",
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/ui:components",
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/ui/context:allowlist",
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/ui/custom_components/web_frame/shared:security_error",
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/ui/utils",
        "//third_party/javascript/lit",
        "//third_party/javascript/lit:context",
        "//third_party/javascript/safevalues",
        "//third_party/javascript/safevalues/dom",
    ],
)

ts_library(
    name = "test_lib",
    testonly = True,
    srcs = ["web-frame_test.ts"],
    deps = [
        ":web_frame_srcdoc",
        ":web_frame_url",
        "//javascript/security/safe_content_frame/v2:testing",
        "//testing/web/jasmine/state:clean_state",
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/ui/context:allowlist",
        "//third_party/javascript/lit:context",
        "//third_party/javascript/typings/jasmine",
    ],
)

js_test_suite(
    name = "test",
    browsers = [
        "//testing/web/browsers/chrome_linux/v145_0_7632_45:chrome-linux",
    ],
    configs = ["//testing/web/configs:deterministic_rendering"],
    test_lib = ":test_lib",
)
