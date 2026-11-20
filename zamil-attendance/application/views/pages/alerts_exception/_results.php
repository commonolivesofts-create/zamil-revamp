<?php
$rows = is_array($rows ?? null)
    ? $rows
    : [];

$currentPage = max(
    1,
    (int) ($currentPage ?? 1)
);

$limit = max(
    1,
    (int) ($limit ?? 15)
);

$e = static function ($value) {
    return htmlspecialchars(
        (string) ($value ?? ''),
        ENT_QUOTES,
        'UTF-8'
    );
};

$severityClass = static function ($severity) {
    switch (strtoupper(
            trim(
                (string) $severity
            )
        )) {
        case 'HIGH':
            return 'ae-severity-high';

        case 'MEDIUM':
            return 'ae-severity-medium';

        default:
            return 'ae-severity-low';
    }
};

$typeIcon = static function ($type) {
    switch ($type) {
        case 'missing_punch':
            return 'ti ti-clock-exclamation';

        case 'same_punch':
            return 'ti ti-equal';

        case 'missing_shift':
            return 'ti ti-calendar-off';

        case 'missing_occasion':
            return 'ti ti-confetti-off';

        case 'high_overtime':
            return 'ti ti-clock-plus';

        case 'missing_timetable':
            return 'ti ti-calendar-x';

        default:
            return 'ti ti-alert-triangle';
    }
};

$startIndex =
    (($currentPage - 1) * $limit);
?>

<div class="ae-table-card">
    <div class="ae-table-head">
        <div>
            <h2>Exception Queue</h2>

            <p>
                Configuration and attendance issues
                requiring review.
            </p>
        </div>

        <div class="ae-legend">
            <span>
                <i class="ae-dot ae-dot-red"></i>
                High
            </span>

            <span>
                <i class="ae-dot ae-dot-amber"></i>
                Medium
            </span>

            <span>
                <i class="ae-dot ae-dot-green"></i>
                Low
            </span>
        </div>
    </div>

    <div class="ae-table-scroll">
        <table class="ae-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Exception</th>
                    <th>Severity</th>
                    <th>Employee</th>
                    <th>Date</th>
                    <th>Details</th>
                </tr>
            </thead>

            <tbody>
                <?php if (empty($rows)): ?>
                    <tr>
                        <td
                            colspan="10"
                            class="ae-empty">
                            <i class="ti ti-circle-check"></i>

                            <strong>
                                No exceptions found
                            </strong>

                            <span>
                                Change the selected dates
                                or filters.
                            </span>
                        </td>
                    </tr>
                <?php else: ?>

                    <?php foreach (
                        $rows as $index => $row
                    ): ?>
                        <?php
                        $severity = trim(
                            (string) (
                                $row['SEVERITY'] ?? ''
                            )
                        );

                        $exceptionType = trim(
                            (string) (
                                $row['EXCEPTION_TYPE'] ?? ''
                            )
                        );

                        $employeeName = trim(
                            (string) (
                                $row['EMP_NAME'] ??
                                'Employee'
                            )
                        );

                        $avatarLetter = strtoupper(
                            substr(
                                $employeeName,
                                0,
                                1
                            )
                        );

                        $isHigh =
                            strtoupper($severity) ===
                            'HIGH';
                        ?>

                        <tr class="<?= $isHigh
                                        ? 'ae-row-alert'
                                        : '' ?>">

                            <td class="ae-index">
                                <?= $startIndex +
                                    $index +
                                    1 ?>
                            </td>

                            <td>
                                <span class="ae-type">
                                    <i class="<?= $e(
                                                    $typeIcon(
                                                        $exceptionType
                                                    )
                                                ) ?>"></i>

                                    <?= $e(
                                        $row['EXCEPTION_LABEL'] ?? '-'
                                    ) ?>
                                </span>
                            </td>

                            <td>
                                <span class="ae-severity <?= $e(
                                                                $severityClass(
                                                                    $severity
                                                                )
                                                            ) ?>">
                                    <?= $e(
                                        $severity ?: '-'
                                    ) ?>
                                </span>
                            </td>

                            <td>
                                <div class="ae-employee">
                                    <span class="ae-avatar">
                                        <?= $e(
                                            $avatarLetter ?: 'E'
                                        ) ?>
                                    </span>

                                    <div>
                                        <strong>
                                            <?= $e(
                                                $employeeName
                                            ) ?>
                                        </strong>

                                        <small>
                                            Emp #
                                            <?= $e(
                                                $row['EMP_NO'] ??
                                                    '-'
                                            ) ?>
                                        </small>
                                    </div>
                                </div>
                            </td>

                          

                            <td>
                                <?= $e(
                                    $row['ATT_DATE_DISPLAY'] ?? '-'
                                ) ?>
                            </td>

                           
                            <td class="ae-details">
                                <?= $e(
                                    $row['DETAILS'] ??
                                        '-'
                                ) ?>
                            </td>
                        </tr>
                    <?php endforeach; ?>

                <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>