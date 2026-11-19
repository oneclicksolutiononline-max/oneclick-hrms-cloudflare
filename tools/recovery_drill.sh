#!/bin/bash
# RECOVERY DRILL – RIG ONLY (18-11-2026, Phase 8): the local test database is copied out (pg_dump), put back into a NEW scratch
# database, and every HR table's row count is compared. Nothing live is touched; the scratch database is dropped at the end.
# On live the same drill is done with Supabase's own backup (Dashboard → Database → Backups → restore into a NEW project) – see
# docs/HR_GO_LIVE.md, part 6.     Run:  timeout 300 bash tools/recovery_drill.sh
set -euo pipefail
SRC=${RIG_DB:-rig_hr}; DST=rig_hr_drill_$$; DIR=$(mktemp -d); chmod 777 "$DIR"; OUT=$DIR/hr.dump; SQL=$DIR/count.sql
case "$SRC" in rig_*) ;; *) echo "only a rig_ database"; exit 1;; esac
cat > "$SQL" <<'Q'
select table_name || '=' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text
from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' and table_name like 'hr\_%' order by table_name;
Q
chmod 644 "$SQL"
su postgres -c "pg_dump -Fc -d $SRC -f $OUT" && echo "copied out: $(du -h $OUT | cut -f1)"
su postgres -c "createdb $DST"; su postgres -c "pg_restore -d $DST --no-owner --no-privileges $OUT" 2>/dev/null || true
A=$(su postgres -c "psql -At -d $SRC -f $SQL"); B=$(su postgres -c "psql -At -d $DST -f $SQL")
su postgres -c "dropdb $DST"; rm -rf "$DIR"
N=$(echo "$A" | wc -l)
if [ "$A" = "$B" ]; then echo "RESTORED: all $N HR tables have the same rows"; else echo "DIFFERENT:"; diff <(echo "$A") <(echo "$B") | head -20; exit 1; fi
