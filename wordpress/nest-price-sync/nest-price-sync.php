<?php
/**
 * Plugin Name: همگام‌سازی قیمت نست
 * Description: قیمت محصولات را از برنامه‌ی محاسبه‌ی قیمت می‌خواند و در متای محصولات سایت می‌نویسد (یک قیمت برای هر محصول، بدون تفکیک رنگ).
 * Version: 1.0.0
 * Requires PHP: 8.0
 * Text Domain: nest-price-sync
 */

if (!defined('ABSPATH')) exit;

const NPS_OPT = 'nest_price_sync';
const NPS_HOOK = 'nest_price_sync_run';
const NPS_PT = 'product';

/** Settings: ['url' => base address of the price app, 'key' => secret key, 'last' => report of the last run]. */
function nps_opts(): array {
  $o = get_option(NPS_OPT, []);
  return is_array($o) ? $o + ['url' => '', 'key' => '', 'last' => null] : ['url' => '', 'key' => '', 'last' => null];
}

/** Compares names ignoring case, spaces, dashes and dots: "T-Once" = "t once" = "TONCE". */
function nps_norm($s): string {
  return strtolower(preg_replace('/[^\p{L}\p{N}]+/u', '', (string) $s));
}


/** The words of a product title like "DECKING – ONCE – FD142 – N10 – BRUSH", normalised: each part between dashes, and each single word. */
function nps_title_parts(string $title): array {
  $out = [];
  foreach (preg_split('/\s+[–—-]\s+|\s*[–—]\s*/u', $title) as $seg) {
    $out[] = nps_norm($seg);
    foreach (preg_split('/\s+/u', trim($seg)) as $w) $out[] = nps_norm($w);
  }
  return array_values(array_unique(array_filter($out, fn($x) => $x !== '')));
}

/** Downloads the price list from the app. Returns [data, error]. */
function nps_fetch(string $base, string $key): array {
  $base = rtrim(trim($base), '/');
  if ($base === '' || $key === '') return [null, 'آدرس یا کلید نوشته نشده است.'];
  if (!preg_match('#^https://#i', $base) && !preg_match('#^http://(localhost|127\.0\.0\.1)#i', $base)) return [null, 'آدرس باید با https شروع شود.'];
  $res = wp_safe_remote_get($base . '/api/public/prices', [
    'timeout' => 25,
    'headers' => ['Authorization' => 'Bearer ' . $key, 'Accept' => 'application/json'],
  ]);
  if (is_wp_error($res)) return [null, 'اتصال برقرار نشد: ' . $res->get_error_message()];
  $code = wp_remote_retrieve_response_code($res);
  if ($code === 401) return [null, 'کلید نادرست است.'];
  if ($code === 404) return [null, 'اتصال در برنامه خاموش است (یا آدرس اشتباه است).'];
  if ($code !== 200) return [null, "برنامه خطا داد ($code)."];
  $data = json_decode(wp_remote_retrieve_body($res), true);
  if (!is_array($data) || ($data['kind'] ?? '') !== 'site-prices' || empty($data['products']) || !is_array($data['products'])) return [null, 'پاسخ برنامه قابل فهم نیست.'];
  return [$data, null];
}

/** One price from the app, or null when it is missing or not a sensible whole number of Toman. */
function nps_price($v): ?int {
  if (!is_numeric($v)) return null;
  $n = (int) round((float) $v);
  return ($n > 0 && $n < 1000000000) ? $n : null;
}

/**
 * Matches the app's products to the site's products and writes the prices.
 * A site product is found by its series name (CLAN, T-Once …) and, failing that, by its code (FD92 …).
 * When both exist but disagree, the series name wins and the product is listed in the report.
 */
function nps_sync(): array {
  $o = nps_opts();
  [$data, $err] = nps_fetch($o['url'], $o['key']);
  $report = ['time' => time(), 'ok' => false, 'message' => '', 'updated' => 0, 'same' => 0, 'notices' => [], 'unmatched_app' => [], 'unmatched_site' => []];
  if ($err) {
    $report['message'] = $err;
    nps_save_report($report);
    return $report;
  }

  $byName = [];
  $byCode = [];
  foreach ($data['products'] as $p) {
    if (!is_array($p) || nps_price($p['perMeter'] ?? null) === null) continue;
    $n = nps_norm($p['name'] ?? '');
    $c = nps_norm($p['code'] ?? '');
    if ($n !== '') $byName[$n][] = $p;
    if ($c !== '') $byCode[$c][] = $p;
  }

  $ids = get_posts(['post_type' => NPS_PT, 'post_status' => ['publish', 'draft', 'pending', 'private'], 'numberposts' => -1, 'fields' => 'ids', 'suppress_filters' => true]);
  $used = [];
  foreach ($ids as $id) {
    $series = nps_norm(get_post_meta($id, '_nest_series', true));
    $code = nps_norm(get_post_meta($id, '_nest_code', true));
    $label = get_the_title($id) . ($code !== '' ? ' (' . get_post_meta($id, '_nest_code', true) . ')' : '');

    $hitName = ($series !== '' && isset($byName[$series]) && count($byName[$series]) === 1) ? $byName[$series][0] : null;
    $hitCode = ($code !== '' && isset($byCode[$code]) && count($byCode[$code]) === 1) ? $byCode[$code][0] : null;
    $viaTitle = false;
    if (!$hitName && !$hitCode) {
      // no usable series/code fields: read the model name (and code) from the title
      foreach (nps_title_parts(get_the_title($id)) as $part) {
        if (!$hitName && isset($byName[$part]) && count($byName[$part]) === 1) $hitName = $byName[$part][0];
        if (!$hitCode && isset($byCode[$part]) && count($byCode[$part]) === 1) $hitCode = $byCode[$part][0];
      }
      $viaTitle = (bool) ($hitName || $hitCode);
    }
    $hit = null;
    if ($hitName && $hitCode) {
      if ($hitName['id'] === $hitCode['id']) $hit = $hitName;
      else {
        // the series name is the model; a code shared by two models is a data slip on the site, so the name wins
        $hit = $hitName;
        $report['notices'][] = "$label: کد سایت مال «{$hitCode['name']}» هم هست. قیمت «{$hitName['name']}» (طبق اسم سری) نوشته شد؛ کد را در سایت به «{$hitName['code']}» اصلاح کنید.";
      }
    } elseif ($hitName) {
      $hit = $hitName;
      if ($code !== '' && $code !== nps_norm($hitName['code'])) $report['notices'][] = "$label: کد در برنامه «{$hitName['code']}» است. قیمت نوشته شد؛ کد یکی نیست.";
    } elseif ($hitCode) {
      $hit = $hitCode;
    } else {
      $report['unmatched_site'][] = $label . ' [سری: ' . (get_post_meta($id, '_nest_series', true) ?: '—') . ' | کد: ' . (get_post_meta($id, '_nest_code', true) ?: '—') . ']';
      continue;
    }

    $pm = nps_price($hit['perMeter']);
    $pm2 = nps_price($hit['perSqm'] ?? null);
    if ($pm2 === null) {
      // the printed list has no square-metre price for it: derive it from the metre price, like the site does
      $per = (float) get_post_meta($id, '_nest_m_per_m2', true);
      if ($per <= 0) { $w = (float) get_post_meta($id, '_nest_width_mm', true); $per = $w > 0 ? 1000 / $w : 0; }
      $pm2 = $per > 0 ? (int) round($pm * $per) : null;
    }
    $changed = false;
    foreach (['_nest_price_m' => $pm, '_nest_price_m2' => $pm2] as $k => $v) {
      if ($v === null) continue;
      if ((int) get_post_meta($id, $k, true) !== $v) { update_post_meta($id, $k, $v); $changed = true; }
    }
    $changed ? $report['updated']++ : $report['same']++;
    $used[$hit['id']] = true;
  }
  foreach ($data['products'] as $p) {
    if (is_array($p) && empty($used[$p['id'] ?? '']) && nps_price($p['perMeter'] ?? null) !== null) {
      $report['unmatched_app'][] = ($p['name'] ?? '?') . ' (' . ($p['code'] ?? '—') . ')';
    }
  }
  if ($report['updated'] > 0) {
    if (function_exists('nest_flush_cache')) nest_flush_cache();
    clean_post_cache(0);
  }
  $report['ok'] = true;
  $report['message'] = 'قیمت‌ها از برنامه گرفته شد' . (!empty($data['jalaliDate']) ? ' (تاریخ لیست: ' . $data['jalaliDate'] . ')' : '') . '.';
  nps_save_report($report);
  return $report;
}

function nps_save_report(array $r): void {
  $o = nps_opts();
  $o['last'] = $r;
  update_option(NPS_OPT, $o, false);
}

// ---- schedule: every hour ----
add_action(NPS_HOOK, 'nps_sync');
add_action('init', function () {
  if (!wp_next_scheduled(NPS_HOOK)) wp_schedule_event(time() + 300, 'hourly', NPS_HOOK);
});
register_deactivation_hook(__FILE__, function () { wp_clear_scheduled_hook(NPS_HOOK); });

// ---- settings page ----
add_action('admin_menu', function () {
  add_options_page('همگام‌سازی قیمت نست', 'همگام‌سازی قیمت نست', 'manage_options', 'nest-price-sync', 'nps_page');
});

function nps_page(): void {
  if (!current_user_can('manage_options')) return;
  $msg = '';
  if (isset($_POST['nps_save']) || isset($_POST['nps_run'])) {
    check_admin_referer('nps_form');
    $o = nps_opts();
    $o['url'] = esc_url_raw(trim(wp_unslash($_POST['nps_url'] ?? '')));
    $key = trim(wp_unslash($_POST['nps_key'] ?? ''));
    if ($key !== '') $o['key'] = preg_replace('/[^A-Za-z0-9_\-]/', '', $key);
    update_option(NPS_OPT, $o, false);
    $msg = 'ذخیره شد.';
    if (isset($_POST['nps_run'])) { $r = nps_sync(); $msg = ($r['ok'] ? 'همگام‌سازی انجام شد. ' : 'همگام‌سازی نشد. ') . $r['message']; }
  }
  $o = nps_opts();
  $r = $o['last'];
  echo '<div class="wrap" dir="rtl" style="max-width:900px"><h1>همگام‌سازی قیمت نست</h1>';
  if ($msg) echo '<div class="notice notice-info"><p>' . esc_html($msg) . '</p></div>';
  echo '<p>قیمت‌ها از برنامه‌ی محاسبه‌ی قیمت خوانده و برای هر محصول (بدون تفکیک رنگ) در سایت نوشته می‌شود. هر ساعت خودکار انجام می‌شود.</p>';
  echo '<form method="post">';
  wp_nonce_field('nps_form');
  echo '<table class="form-table"><tr><th>آدرس برنامه</th><td><input type="url" name="nps_url" value="' . esc_attr($o['url']) . '" class="regular-text" style="direction:ltr" placeholder="https://fc.nestwpc.com"></td></tr>';
  echo '<tr><th>کلید مخفی</th><td><input type="password" name="nps_key" value="" class="regular-text" style="direction:ltr" autocomplete="off" placeholder="' . ($o['key'] !== '' ? 'نوشته شده؛ برای عوض کردن، کلید جدید را بنویسید' : 'کلید را از برنامه کپی کنید') . '"></td></tr></table>';
  echo '<p><button class="button button-primary" name="nps_save" value="1">ذخیره</button> <button class="button" name="nps_run" value="1">ذخیره و همگام‌سازی همین الان</button></p></form>';

  if (is_array($r)) {
    echo '<h2>آخرین همگام‌سازی</h2><p>' . esc_html(wp_date('Y/m/d H:i', (int) $r['time'])) . ' — ' . ($r['ok'] ? '✅' : '❌') . ' ' . esc_html($r['message']) . '</p>';
    if ($r['ok']) {
      echo '<p>قیمت عوض شد: <b>' . (int) $r['updated'] . '</b> محصول · بدون تغییر: <b>' . (int) $r['same'] . '</b></p>';
      foreach (['notices' => 'نکته‌ها', 'unmatched_site' => 'محصول‌های سایت که در برنامه جفت نداشتند (قیمتشان دست نخورد)', 'unmatched_app' => 'محصول‌های برنامه که در سایت پیدا نشدند'] as $k => $title) {
        if (!empty($r[$k])) {
          echo '<h3>' . esc_html($title) . ' (' . count($r[$k]) . ')</h3><ul style="list-style:disc;margin-right:20px">';
          foreach (array_slice($r[$k], 0, 60) as $line) echo '<li>' . esc_html($line) . '</li>';
          echo '</ul>';
        }
      }
    }
  }
  echo '</div>';
}
