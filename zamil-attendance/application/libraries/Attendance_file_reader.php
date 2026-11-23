<?php
defined('BASEPATH') or exit('No direct script access allowed');

class Attendance_file_reader
{
    public function read($filePath, $originalName)
    {
        $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        if ($extension === 'csv') {
            return $this->readCsv($filePath);
        }
        if ($extension === 'xlsx') {
            return $this->readXlsx($filePath);
        }
        throw new Exception('Only CSV and XLSX files are supported. Please save old XLS files as XLSX.');
    }

    private function readCsv($filePath)
    {
        $handle = fopen($filePath, 'r');

        if (!$handle) {
            throw new Exception('Unable to open CSV file.');
        }

        /*
     * Remove UTF-8 BOM BEFORE fgetcsv parses the first row.
     * If BOM is not present, rewind back to the beginning.
     */
        $bom = fread($handle, 3);

        if ($bom !== "\xEF\xBB\xBF") {
            rewind($handle);
        }

        $rows = [];

        while (($row = fgetcsv($handle)) !== false) {
            $rows[] = $row;
        }

        fclose($handle);

        return $rows;
    }

    private function readXlsx($filePath)
    {
        if (!class_exists('ZipArchive')) throw new Exception('PHP Zip extension is required for XLSX upload.');
        $zip = new ZipArchive();
        if ($zip->open($filePath) !== true) throw new Exception('Unable to open XLSX file.');

        $shared = [];
        $sharedXml = $zip->getFromName('xl/sharedStrings.xml');
        if ($sharedXml !== false) {
            $xml = simplexml_load_string($sharedXml);
            if ($xml) {
                foreach ($xml->si as $si) {
                    $text = '';
                    if (isset($si->t)) $text = (string)$si->t;
                    else if (isset($si->r)) foreach ($si->r as $run) $text .= (string)$run->t;
                    $shared[] = $text;
                }
            }
        }

        $sheetXml = $zip->getFromName('xl/worksheets/sheet1.xml');
        $zip->close();
        if ($sheetXml === false) throw new Exception('The first worksheet could not be read.');
        $xml = simplexml_load_string($sheetXml);
        if (!$xml) throw new Exception('Invalid XLSX worksheet.');

        $rows = [];
        foreach ($xml->sheetData->row as $row) {
            $values = [];
            foreach ($row->c as $cell) {
                $ref = (string)$cell['r'];
                preg_match('/^[A-Z]+/', $ref, $m);
                $index = $this->columnIndex($m[0]);
                $type = (string)$cell['t'];
                $value = isset($cell->v) ? (string)$cell->v : '';
                if ($type === 's') $value = isset($shared[(int)$value]) ? $shared[(int)$value] : '';
                elseif ($type === 'inlineStr') $value = isset($cell->is->t) ? (string)$cell->is->t : '';
                $values[$index] = $value;
            }
            if (!empty($values)) {
                $max = max(array_keys($values));
                $normalized = [];
                for ($i = 0; $i <= $max; $i++) $normalized[] = isset($values[$i]) ? $values[$i] : '';
                $rows[] = $normalized;
            }
        }
        return $rows;
    }

    private function columnIndex($letters)
    {
        $index = 0;
        for ($i = 0; $i < strlen($letters); $i++) $index = ($index * 26) + (ord($letters[$i]) - 64);
        return $index - 1;
    }
}
