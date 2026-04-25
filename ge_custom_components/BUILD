load("//javascript/typescript:build_defs.bzl", "ts_library")

package(
    default_applicable_licenses = ["//third_party/a2ui:license"],
    default_visibility = [
        ":default_visibility",
        "//third_party/a2ui:internal",
    ],
)

package_group(
    name = "default_visibility",
    packages = [
        "//google/cloud/discoveryengine/apps/ucs_widget/...",
        "//java/com/google/video/youtube/datawarehouse/analytics/ui/...",
        "//third_party/a2ui/renderers/lit_internal/...",
    ],
)

ts_library(
    name = "custom_components",
    srcs = ["index.ts"],
    tsc_config = "//third_party/a2ui/renderers/lit_internal:tsc_config",
    deps = [
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/ui:component-registry",
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/ui/custom_components/data_grid",
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/ui/custom_components/product_selection",
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/ui/custom_components/vega_chart",
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/ui/custom_components/web_frame:web_frame_srcdoc",
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/ui/custom_components/web_frame:web_frame_url",
    ],
)
