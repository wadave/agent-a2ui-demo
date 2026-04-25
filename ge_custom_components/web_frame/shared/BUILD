load("//javascript/typescript:build_defs.bzl", "ts_library")

package(
    default_applicable_licenses = ["//third_party/a2ui:license"],
    default_visibility = [
        "//third_party/a2ui:internal",
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/ui/custom_components/web_frame:__subpackages__",
    ],
)

ts_library(
    name = "security_error",
    srcs = ["security-error.ts"],
    deps = [
        "//third_party/javascript/lit",
    ],
)
