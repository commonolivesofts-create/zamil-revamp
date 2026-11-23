<style>
    .fsl-page {
        --navy: #0e2036;
        --teal: #0fa894;
        --amber: #e8a23d;
        --coral: #e15b4d;
        --violet: #6c63c9;
        --line: #e1e6ed;
        --muted: #5b6b84;
        color: #101b2d
    }

    .fsl-hero {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
        padding: 11px;
        margin-bottom: 2px;
        border-radius: 14px;
        background: linear-gradient(120deg, #0e2036 0%, #15304e 58%, #0f3e52 100%);
        color: #fff
    }

    .fsl-eyebrow {
        display: inline-block;
        margin-bottom: 8px;
        color: #7eebdb;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: .8px;
        text-transform: uppercase
    }

    .fsl-hero h1 {
        margin: 0;
        color: #fff;
        font-size: 27px;
        font-weight: 800
    }

    .fsl-hero p {
        max-width: 720px;
        margin: 9px 0 0;
        color: #c5d1e0;
        font-size: 13px;
        line-height: 1.65
    }

    .fsl-hero-icon {
        display: grid;
        width: 74px;
        height: 74px;
        flex: 0 0 74px;
        place-items: center;
        border: 1px solid rgba(255, 255, 255, .18);
        border-radius: 18px;
        background: rgba(255, 255, 255, .08);
        font-size: 34px
    }

    .fsl-summary-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 14px;
        margin-bottom: 20px
    }

    .fsl-summary-card {
        position: relative;
        padding: 16px 16px 15px 18px;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: #fff;
        overflow: hidden
    }

    .fsl-summary-card:before {
        position: absolute;
        inset: 0 auto 0 0;
        width: 3px;
        background: var(--navy);
        content: ""
    }

    .fsl-summary-existing:before {
        background: var(--teal)
    }

    .fsl-summary-new:before {
        background: var(--violet)
    }

    .fsl-summary-high:before {
        background: var(--coral)
    }

    .fsl-summary-card span {
        display: block;
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: .4px;
        text-transform: uppercase
    }

    .fsl-summary-card strong {
        display: block;
        margin: 5px 0 2px;
        font-size: 27px;
        line-height: 1
    }

    .fsl-summary-card small {
        color: #8c99ad;
        font-size: 11px
    }

    .fsl-filter-panel {
        display: grid;
        grid-template-columns: minmax(260px, 1fr) 190px 150px 160px auto;
        gap: 10px;
        padding: 14px;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: #fff
    }

    .fsl-search-box {
        position: relative
    }

    .fsl-search-box i {
        position: absolute;
        top: 50%;
        left: 12px;
        color: #8c99ad;
        transform: translateY(-50%)
    }

    .fsl-search-box input,
    .fsl-filter-panel select {
        width: 100%;
        min-height: 39px;
        border: 1px solid var(--line);
        border-radius: 7px;
        background: #fff;
        color: #101b2d;
        font-size: 12px;
        outline: none
    }

    .fsl-search-box input {
        padding: 8px 12px 8px 35px
    }

    .fsl-filter-panel select {
        padding: 8px 10px
    }

    .fsl-clear-btn {
        min-height: 39px;
        padding: 7px 13px;
        border: 1px solid var(--line);
        border-radius: 7px;
        background: #fff;
        color: #34445c;
        font-size: 12px;
        font-weight: 700
    }

    .fsl-result-line {
        padding: 10px 2px 6px;
        color: #8c99ad;
        font-size: 11px
    }

    .fsl-group {
        margin: 12px 0 22px
    }

    .fsl-group-head {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 11px
    }

    .fsl-group-icon {
        display: grid;
        width: 39px;
        height: 39px;
        flex: 0 0 39px;
        place-items: center;
        border-radius: 9px;
        background: rgba(15, 168, 148, .12);
        color: var(--teal);
        font-size: 19px
    }

    .fsl-group-head h2 {
        margin: 0;
        font-size: 16px;
        font-weight: 800
    }

    .fsl-group-head p {
        margin: 3px 0 0;
        color: var(--muted);
        font-size: 11.5px
    }

    .fsl-group-count {
        margin-left: auto;
        padding: 4px 9px;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: #fff;
        color: #6f7d91;
        font-size: 10px;
        font-weight: 700
    }

    .fsl-feature-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 13px
    }

    .fsl-feature-card {
        display: flex;
        min-height: 205px;
        flex-direction: column;
        padding: 16px;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: #fff
    }

    .fsl-feature-card[hidden] {
        display: none !important
    }

    .fsl-feature-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 12px
    }

    .fsl-status,
    .fsl-priority {
        padding: 3px 8px;
        border-radius: 999px;
        font-size: 9px;
        font-weight: 800;
        letter-spacing: .3px;
        text-transform: uppercase
    }

    .fsl-status-existing {
        background: #e5f8f4;
        color: #0b7a6c
    }

    .fsl-status-new {
        background: #eeecfb;
        color: #5147a8
    }

    .fsl-priority-high {
        background: #fce8e5;
        color: #bc3a2c
    }

    .fsl-priority-medium {
        background: #fdf1de;
        color: #a9711c
    }

    .fsl-priority-low {
        background: #f1f2f5;
        color: #6f7d91
    }

    .fsl-feature-card h3 {
        margin: 0 0 7px;
        font-size: 14px;
        font-weight: 800
    }

    .fsl-feature-card>p {
        margin: 0;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.55
    }

    .fsl-benefit {
        display: flex;
        align-items: flex-start;
        gap: 7px;
        margin-top: auto;
        padding-top: 13px;
        border-top: 1px solid #eef1f5;
        color: #4c5d74;
        font-size: 11px;
        line-height: 1.45
    }

    .fsl-benefit i {
        margin-top: 1px;
        color: var(--amber);
        font-size: 15px
    }

    .fsl-empty {
        padding: 50px 20px;
        border: 1px dashed #cfd7e2;
        border-radius: 10px;
        background: #fff;
        color: #8390a3;
        text-align: center
    }

    .fsl-empty i,
    .fsl-empty strong,
    .fsl-empty span {
        display: block
    }

    .fsl-empty i {
        margin-bottom: 8px;
        font-size: 32px
    }

    .fsl-empty strong {
        color: #34445c;
        font-size: 14px
    }

    .fsl-empty span {
        margin-top: 3px;
        font-size: 11px
    }

    @media(max-width:1150px) {
        .fsl-filter-panel {
            grid-template-columns: repeat(2, minmax(0, 1fr))
        }

        .fsl-feature-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr))
        }
    }

    @media(max-width:780px) {

        .fsl-summary-grid,
        .fsl-feature-grid,
        .fsl-filter-panel {
            grid-template-columns: 1fr
        }

        .fsl-hero {
            padding: 22px
        }

        .fsl-hero-icon {
            display: none
        }

        .fsl-group-head {
            align-items: flex-start
        }

        .fsl-group-count {
            display: none
        }
    }
</style>
<?php
defined('BASEPATH') or exit('No direct script access allowed');
$featureGroups = $featureGroups ?? [];
$summary = $summary ?? [];
$e = static function ($value) {
    return html_escape((string) ($value ?? ''));
};
?>
<div class="fsl-page">
    <section class="fsl-hero">
        <div>
            <span class="fsl-eyebrow">Zamil Attendance Roadmap</span>
            <h1>Function & Features</h1>
            <p>A complete view of existing attendance capabilities and recommended modules for the next phases of the Zamil Attendance system.</p>
        </div>
        <div class="fsl-hero-icon"><i class="ti ti-route"></i></div>
    </section>

    <!-- <section class="fsl-summary-grid">
        <article class="fsl-summary-card"><span>Total Features</span><strong><?= (int)($summary['total'] ?? 0) ?></strong><small>Across all attendance modules</small></article>
        <article class="fsl-summary-card fsl-summary-existing"><span>Available Features</span><strong><?= (int)($summary['existing'] ?? 0) ?></strong><small>Already available or currently developed</small></article>
        <article class="fsl-summary-card fsl-summary-new"><span>Proposed Features</span><strong><?= (int)($summary['new'] ?? 0) ?></strong><small>Recommended for future phases</small></article>
        <article class="fsl-summary-card fsl-summary-high"><span>High Priority</span><strong><?= (int)($summary['high'] ?? 0) ?></strong><small>Recommended before lower-priority items</small></article>
    </section> -->

   

    <div class="fsl-result-line"><span id="fsl-result-count"><?= (int)($summary['total'] ?? 0) ?> features shown</span></div>

    <div id="fsl-groups">
        <?php foreach ($featureGroups as $group): ?>
            <section class="fsl-group" data-group="<?= $e($group['key']) ?>">
                <div class="fsl-group-head">
                    <div class="fsl-group-icon"><i class="<?= $e($group['icon']) ?>"></i></div>
                    <div>
                        <h2><?= $e($group['title']) ?></h2>
                        <p><?= $e($group['description']) ?></p>
                    </div>
                    <span class="fsl-group-count"><?= count($group['features']) ?> features</span>
                </div>
                <div class="fsl-feature-grid">
                    <?php foreach ($group['features'] as $feature): ?>
                        <?php $searchText = strtolower($feature['title'] . ' ' . $feature['description'] . ' ' . $feature['benefit'] . ' ' . $group['title']); ?>
                        <article class="fsl-feature-card" data-category="<?= $e($group['key']) ?>" data-status="<?= $e($feature['status']) ?>" data-priority="<?= $e($feature['priority']) ?>" data-search="<?= $e($searchText) ?>">
                            <div class="fsl-feature-top">
                                <span class="fsl-status fsl-status-<?= $e($feature['status']) ?>"><?= $feature['status'] === 'existing' ? 'Available' : 'Proposed' ?></span>
                                <span class="fsl-priority fsl-priority-<?= $e($feature['priority']) ?>"><?= ucfirst($feature['priority']) ?> priority</span>
                            </div>
                            <h3><?= $e($feature['title']) ?></h3>
                            <p><?= $e($feature['description']) ?></p>
                            <div class="fsl-benefit"><i class="ti ti-bulb"></i><span><?= $e($feature['benefit']) ?></span></div>
                        </article>
                    <?php endforeach; ?>
                </div>
            </section>
        <?php endforeach; ?>
    </div>

    <section id="fsl-empty" class="fsl-empty" hidden><i class="ti ti-list-search"></i><strong>No matching features found</strong><span>Change the filters or clear the search.</span></section>
</div>