load("//javascript/lit/build_defs:lit_css_module.bzl", "lit_css_module")
load("//javascript/typescript:build_defs.bzl", "ts_library")
load("//third_party/bazel_rules/rules_sass/sass:sass.bzl", "sass_binary")

package(
    default_applicable_licenses = ["//third_party/a2ui:license"],
    default_visibility = [
        "//third_party/a2ui:internal",
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/ui/custom_components:default_visibility",
    ],
)

ts_library(
    name = "data_grid_schema",
    srcs = ["data_grid_schema.ts"],
)

ts_library(
    name = "data_grid_type_utilities",
    srcs = ["data_grid_type_utilities.ts"],
    deps = [":data_grid_schema"],
)

ts_library(
    name = "data_grid_utilities",
    srcs = ["data_grid_utilities.ts"],
    deps = [
        ":data_grid_schema",
        ":data_grid_type_utilities",
    ],
)

ts_library(
    name = "data_grid_number_formatting",
    srcs = ["data_grid_number_formatting.ts"],
    deps = [
        ":data_grid_schema",
        ":data_grid_type_utilities",
        "//third_party/javascript/malloy/ssf:ssf_raw",
    ],
)

lit_css_module(
    name = "styles",
    src = "data-grid.css",
)

sass_binary(
    name = "styles_css",
    src = "data-grid.scss",
    output_name = "data-grid.css",
    sass_stack = True,
    strict_deps = True,
    deps = [
    ],
)

ts_library(
    name = "data_grid",
    srcs = ["data-grid.ts"],
    use_lit_plugin = True,
    deps = [
        ":data_grid_number_formatting",
        ":data_grid_schema",
        ":data_grid_type_utilities",
        ":data_grid_utilities",
        ":styles",
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/ui:components",
        "//third_party/javascript/lit",
    ],
)
