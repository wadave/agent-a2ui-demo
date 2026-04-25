load("//javascript/lit/build_defs:lit_css_module.bzl", "lit_css_module")
load("//javascript/typescript:build_defs.bzl", "ts_development_sources", "ts_library")
load("//third_party/bazel_rules/rules_sass/sass:sass.bzl", "sass_binary")
load("//tools/build_defs/js/devserver:web_dev_server.bzl", "web_dev_server")

package(
    default_applicable_licenses = ["//third_party/a2ui:license"],
    default_visibility = ["//third_party/a2ui:internal"],
)

sass_binary(
    name = "site_css",
    src = "site.scss",
    output_name = "site.css",
    deps = [
        "//google/cloud/discoveryengine/apps/ucs_widget/shared:theme_sass",
    ],
)

lit_css_module(
    name = "site_styles",
    src = "site.css",
)

sass_binary(
    name = "a2ui_gallery_css",
    src = "a2ui-gallery.scss",
    output_name = "a2ui-gallery.css",
)

lit_css_module(
    name = "a2ui_gallery_styles",
    src = "a2ui-gallery.css",
)

sass_binary(
    name = "demo_dialog_css",
    src = "demo-dialog.scss",
    output_name = "demo-dialog.css",
)

lit_css_module(
    name = "demo_dialog_styles",
    src = "demo-dialog.css",
)

sass_binary(
    name = "demo_slide_out_css",
    src = "demo-slide-out.scss",
    output_name = "demo-slide-out.css",
)

lit_css_module(
    name = "demo_slide_out_styles",
    src = "demo-slide-out.css",
)

sass_binary(
    name = "a2ui_composer_css",
    src = "a2ui-composer.scss",
    output_name = "a2ui-composer.css",
)

lit_css_module(
    name = "a2ui_composer_styles",
    src = "a2ui-composer.css",
)

sass_binary(
    name = "a2ui_standard_components_css",
    src = "a2ui-standard-components.scss",
    output_name = "a2ui-standard-components.css",
)

lit_css_module(
    name = "a2ui_standard_components_styles",
    src = "a2ui-standard-components.css",
)

ts_library(
    name = "a2ui_demo_lib",
    srcs = [
        "a2ui-composer.ts",
        "a2ui-gallery.ts",
        "a2ui-standard-components.ts",
        "a2ui-surface-container.ts",
        "component_data.ts",
        "demo-dialog.ts",
        "demo-slide-out.ts",
        "gallery_data.ts",
        "index.ts",
        "raindrop-html.ts",
        "schema-validator.ts",
        "settings.ts",
        "types.ts",
    ],
    use_lit_plugin = True,
    deps = [
        ":a2ui_composer_styles",
        ":a2ui_gallery_styles",
        ":a2ui_standard_components_styles",
        ":demo_dialog_styles",
        ":demo_slide_out_styles",
        ":site_styles",
        "//google/cloud/discoveryengine/apps/ucs_widget/standalone/components/ucs_a2ui:styles",
        "//google/cloud/discoveryengine/apps/ucs_widget/standalone/components/ucs_a2ui:theme",
        "//third_party/a2ui/renderers/lit_internal",
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/ui",
        "//third_party/a2ui/renderers/lit_internal/src/v0_8/ui:components",
        "//third_party/javascript/lit",
        "//third_party/javascript/lit:context",
        "//third_party/javascript/material/web/dialog:ts",
        "//third_party/javascript/material/web/icon:ts",
        "//third_party/javascript/material/web/iconbutton:ts",
        "//third_party/javascript/safevalues",
        "//third_party/javascript/safevalues/dom",
    ],
)

ts_development_sources(
    name = "demo_srcs",
    deps = [
        ":a2ui_demo_lib",
    ],
)

web_dev_server(
    name = "demo",
    concatjs_routes = {":demo_srcs": "/_/ts_scripts.js"},
    static_files = [
        "assets/google_logo.svg",
        "assets/audio.mp3",
        "assets/workday.svg",
    ],
)
