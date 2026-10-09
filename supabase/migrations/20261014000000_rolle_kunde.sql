-- Neue Rolle für das Kundenportal. Eigene Datei, weil ein neuer Enum-Wert
-- erst nach dem Abschluss dieser Transaktion benutzt werden darf.
alter type app_role add value if not exists 'kunde';
