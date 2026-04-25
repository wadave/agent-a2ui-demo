load("//javascript/lit/build_defs:lit_css_module.bzl", "lit_css_module")
load("//javascript/typescript:build_defs.bzl", "ts_library")
load("//testing/web/build_defs/js_test:js_test_suite.bzl", "js_test_suite")
load("//third_party/bazel_rules/rules_sass/sass:sass.bzl", "sass_binary")

package(
    default_applicable_licenses = ["//third_party/a2ui:license"],
    default_visibility = [
        "//third_party/a2ui:internal",
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/ui/custom_components:default_visibility",
    ],
)

ts_library(
    name = "vega_chart",
    srcs = ["vega-chart.ts"],
    use_lit_plugin = True,
    deps = [
        ":styles",
        "//javascript/analysis/data/common/vega/renderer:safe_vega",
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/ui:components",
        "//third_party/javascript/lit",
        "//third_party/javascript/vega:vega_ts",
        "//third_party/javascript/vega_lite:vega_lite_ts",
    ],
)

lit_css_module(
    name = "styles",
    src = "vega-chart.css",
)

sass_binary(
    name = "styles_css",
    src = "vega-chart.scss",
    output_name = "vega-chart.css",
    sass_stack = True,
    strict_deps = True,
    deps = [
    ],
)

ts_library(
    name = "harness_lib",
    testonly = True,
    srcs = [
        "vega-chart_harness.ts",
    ],
    deps = [
        ":vega_chart",
    ],
)

ts_library(
    name = "test_lib",
    testonly = True,
    srcs = [
        "vega-chart_test.ts",
    ],
    deps = [
        ":harness_lib",
        ":vega_chart",
        "//javascript/analysis/data/common/vega/renderer/testing:state",
        "//testing/web/jasmine/state:clean_state",
        "//testing/web/jasmine/state:use_state",
        "//third_party/javascript/typings/jasmine",
        "//third_party/javascript/vega_lite:vega_lite_ts",
    ],
)

js_test_suite(
    name = "test",
    browsers = [
        "//testing/web/browsers/chrome_linux/v145_0_7632_45:chrome-linux",
    ],
    configs = ["//testing/web/configs:deterministic_rendering"],
    enforce_strict_csp = False,  # See go/SafeContentFrame#testing
    enforce_trusted_types = False,
    test_lib = ":test_lib",
)
