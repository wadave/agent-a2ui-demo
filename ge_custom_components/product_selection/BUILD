load("//javascript/lit/build_defs:lit_css_module.bzl", "lit_css_module")
load("//javascript/typescript:build_defs.bzl", "ts_library")
load("//third_party/bazel_rules/rules_sass/sass:sass.bzl", "sass_binary")

package(
    default_applicable_licenses = ["//third_party/a2ui:license"],
    default_visibility = [
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/ui/custom_components:default_visibility",
    ],
)

lit_css_module(
    name = "styles",
    src = "product-selection.css",
)

sass_binary(
    name = "styles_css",
    src = "product-selection.scss",
    output_name = "product-selection.css",
    sass_stack = True,
    strict_deps = True,
    deps = [
    ],
)

ts_library(
    name = "product_selection",
    srcs = ["product-selection.ts"],
    use_lit_plugin = True,
    deps = [
        ":styles",
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/events",
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/types",
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/types:components",
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/ui:components",
        "//third_party/javascript/lit",
        "//third_party/javascript/material/web/icon:ts",
        "//third_party/javascript/material/web/select:ts",
        "//third_party/javascript/material/web/textfield:ts",
    ],
)
