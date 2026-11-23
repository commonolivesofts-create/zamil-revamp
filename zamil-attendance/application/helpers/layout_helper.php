<?php

if (!function_exists('resolve_asset_url')) {
    function resolve_asset_url(string $path): string
    {
        $path = trim($path);

        if ($path === '') {
            return '';
        }

        // Allow only http/https external URLs
        if (filter_var($path, FILTER_VALIDATE_URL)) {
            $scheme = parse_url($path, PHP_URL_SCHEME);
            return in_array($scheme, ['http', 'https'], true) ? $path : '';
        }

        // Local file validation
        if (!preg_match('#^[a-zA-Z0-9/_\.\-]+$#', $path)) {
            return '';
        }

        // Use framework helper if available
        if (function_exists('base_url')) {
            return base_url(ltrim($path, '/'));
        }

        return '/' . ltrim($path, '/');
    }
}

if (!function_exists('is_valid_asset')) {
    function is_valid_asset(string $path, string $type): bool
    {
        if ($path === '') {
            return false;
        }

        $allowedExtension = $type === 'css' ? 'css' : 'js';

        $urlPath = parse_url($path, PHP_URL_PATH);
        if (!$urlPath) {
            return false;
        }

        $extension = strtolower(pathinfo($urlPath, PATHINFO_EXTENSION));

        return $extension === $allowedExtension;
    }
}

if (!function_exists('build_html_attributes')) {
    function build_html_attributes(array $attributes): string
    {
        $html = [];

        foreach ($attributes as $key => $value) {
            if (is_bool($value)) {
                if ($value) {
                    $html[] = htmlspecialchars((string) $key, ENT_QUOTES, 'UTF-8');
                }
                continue;
            }

            if ($value === null || $value === '') {
                continue;
            }

            $html[] = sprintf(
                '%s="%s"',
                htmlspecialchars((string) $key, ENT_QUOTES, 'UTF-8'),
                htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8')
            );
        }

        return implode(' ', $html);
    }
}

if (!function_exists('normalize_assets')) {
    function normalize_assets(array $assets, string $type): array
    {
        $sourceKey = $type === 'css' ? 'href' : 'src';

        $allowedAttributes = $type === 'css'
            ? ['media', 'rel', 'integrity', 'crossorigin', 'referrerpolicy']
            : ['defer', 'async', 'type', 'integrity', 'crossorigin', 'referrerpolicy'];

        $normalized = [];
        $seen = [];

        foreach ($assets as $asset) {
            // Allow string format
            if (is_string($asset)) {
                $asset = [$sourceKey => $asset];
            }

            if (!is_array($asset)) {
                continue;
            }

            $path = trim((string)($asset[$sourceKey] ?? ''));

            if (!is_valid_asset($path, $type)) {
                continue;
            }

            $resolvedPath = resolve_asset_url($path);

            if ($resolvedPath === '') {
                continue;
            }

            // Prevent duplicate assets
            if (isset($seen[$resolvedPath])) {
                continue;
            }

            $seen[$resolvedPath] = true;

            $item = [$sourceKey => $resolvedPath];

            if ($type === 'css') {
                $item['rel'] = $asset['rel'] ?? 'stylesheet';
            }

            foreach ($allowedAttributes as $attribute) {
                if (array_key_exists($attribute, $asset)) {
                    $item[$attribute] = $asset[$attribute];
                }
            }

            $normalized[] = $item;
        }

        return $normalized;
    }
}

if (!function_exists('render_css')) {
    function render_css(array $styles = []): string
    {
        $styles = normalize_assets($styles, 'css');
        $output = [];

        foreach ($styles as $style) {
            $output[] = '<link ' . build_html_attributes($style) . '>';
        }

        return implode(PHP_EOL, $output);
    }
}

if (!function_exists('render_scripts')) {
    function render_scripts(array $scripts = []): string
    {
        $scripts = normalize_assets($scripts, 'js');
        $output = [];

        foreach ($scripts as $script) {
            $src = $script['src'];
            unset($script['src']);

            $attributes = build_html_attributes(array_merge(['src' => $src], $script));
            $output[] = '<script ' . $attributes . '></script>';
        }

        return implode(PHP_EOL, $output);
    }
}
