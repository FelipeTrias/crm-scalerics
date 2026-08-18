#!/usr/bin/env bash
# Verificacion de seguridad de la API del CRM.
#
# Comprueba que el filtro por rol este en el servidor y no se pueda esquivar.
# Es la prueba de que la cartera es de la empresa y no del vendedor: sin esto,
# el resto del sistema no resuelve el problema que se pidio resolver.
#
# Uso:
#   bash scripts/verificar-seguridad.sh                                      (local)
#   bash scripts/verificar-seguridad.sh https://crm-scalerics.felipetrias.workers.dev
#
# Necesita el seed aplicado en la base contra la que se corre.
B="${1:-http://localhost:8788}"
J='Content-Type: application/json'
DIR="$(mktemp -d)"; trap "rm -rf $DIR" EXIT
ok=0; fallo=0

login() { rm -f "$DIR/c-$1.txt"; curl -s -o /dev/null -c "$DIR/c-$1.txt" -X POST "$B/api/auth/login" -H "$J" -d "{\"email\":\"$1@scalerics.com.uy\",\"password\":\"demo1234\"}"; }

# probar <descripcion> <esperado> <curl-args...>
probar() {
  local desc="$1" esp="$2"; shift 2
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' "$@")
  if [ "$code" = "$esp" ]; then ok=$((ok+1)); printf '  \033[32mOK\033[0m   %-3s  %s\n' "$code" "$desc"
  else fallo=$((fallo+1)); printf '  \033[31mFALLA\033[0m %-3s  %s  (esperaba %s)\n' "$code" "$desc" "$esp"; fi
}

login gustavo; login martin; login lucia
G="$DIR/c-gustavo.txt"; M="$DIR/c-martin.txt"; L="$DIR/c-lucia.txt"

echo "── 1. Sin sesion: todo cerrado ──"
for r in "GET /api/me" "GET /api/clientes" "GET /api/clientes/1" "GET /api/clientes/1/interacciones" \
         "GET /api/pipeline" "GET /api/alertas" "GET /api/vendedores" "GET /api/dashboard"; do
  probar "$r" 401 -X "${r% *}" "$B${r#* }"
done
probar "POST /api/clientes"            401 -X POST   "$B/api/clientes"            -H "$J" -d '{"razon_social":"X"}'
probar "POST /api/clientes/reasignar"  401 -X POST   "$B/api/clientes/reasignar"  -H "$J" -d '{}'
probar "PATCH /api/clientes/1"         401 -X PATCH  "$B/api/clientes/1"          -H "$J" -d '{"notas":"x"}'
probar "DELETE /api/clientes/1"        401 -X DELETE "$B/api/clientes/1"
probar "PATCH /api/usuarios/2"         401 -X PATCH  "$B/api/usuarios/2"          -H "$J" -d '{"activo":0}'
probar "PATCH /api/pedidos/1"       401 -X PATCH  "$B/api/pedidos/1"          -H "$J" -d '{"estado":"entregado"}'
probar "POST /api/clientes/1/pedidos" 401 -X POST   "$B/api/clientes/1/pedidos" -H "$J" -d '{"items":[]}'
probar "GET /api/productos"          401 "$B/api/productos"
probar "POST /api/clientes/1/atendido"  401 -X POST   "$B/api/clientes/1/atendido" -H "$J" -d '{}'
probar "POST /api/clientes/1/contactos" 401 -X POST  "$B/api/clientes/1/contactos" -H "$J" -d '{"nombre":"X"}'
probar "PATCH /api/contactos/1"        401 -X PATCH  "$B/api/contactos/1"         -H "$J" -d '{"cargo":"X"}'

echo "── 2. Token adulterado ──"
TOK=$(grep sesion "$M" | awk '{print $7}')
# Se cambia un caracter del MEDIO de la firma, no el ultimo: la firma son 43
# caracteres base64url para 32 bytes, y los ultimos 2 bits del ultimo caracter
# los descarta el decodificador. Tocar ahi puede no cambiar ni un byte.
ALTERADO=$(node -e "const t='$TOK'.split('.');const f=t[2];t[2]=f.slice(0,20)+(f[20]==='A'?'B':'A')+f.slice(21);process.stdout.write(t.join('.'))")
probar "firma cambiada"           401 "$B/api/me" -H "Cookie: sesion=$ALTERADO"
FALSO=$(node -e "const t='$TOK'.split('.');const p=JSON.parse(Buffer.from(t[1],'base64url').toString());p.rol='admin';t[1]=Buffer.from(JSON.stringify(p)).toString('base64url');process.stdout.write(t.join('.'))")
probar "payload editado a admin"  401 "$B/api/me" -H "Cookie: sesion=$FALSO"
probar "cookie basura"            401 "$B/api/me" -H "Cookie: sesion=cualquiera"

echo "── 3. Vendedor sobre datos ajenos (cliente 1 es de Lucia) ──"
probar "GET cliente ajeno -> 404"          404 -b "$M" "$B/api/clientes/1"
probar "GET bitacora ajena -> 404"         404 -b "$M" "$B/api/clientes/1/interacciones"
probar "PATCH cliente ajeno -> 403"        403 -b "$M" -X PATCH "$B/api/clientes/1" -H "$J" -d '{"notas":"x"}'
probar "POST interaccion ajena -> 403"     403 -b "$M" -X POST "$B/api/clientes/1/interacciones" -H "$J" -d '{"tipo":"llamada"}'
probar "POST contacto ajeno -> 403"        403 -b "$M" -X POST "$B/api/clientes/1/contactos" -H "$J" -d '{"nombre":"X"}'
probar "PATCH contacto ajeno -> 403"       403 -b "$M" -X PATCH "$B/api/contactos/1" -H "$J" -d '{"cargo":"X"}'
probar "POST pedido en cliente ajeno -> 403" 403 -b "$M" -X POST "$B/api/clientes/1/pedidos" -H "$J" -d '{"items":[{"producto_id":11,"cantidad":2}]}'
probar "PATCH pedido ajeno -> 403"    403 -b "$M" -X PATCH "$B/api/pedidos/1" -H "$J" -d '{"estado":"anulado"}'
probar "GET pedidos de cliente ajeno -> 404" 404 -b "$M" "$B/api/clientes/1/pedidos"

echo "── 4. Operaciones reservadas al dueño ──"
probar "DELETE cliente propio -> 403"      403 -b "$M" -X DELETE "$B/api/clientes/2"
probar "reasignar cartera -> 403"          403 -b "$M" -X POST "$B/api/clientes/reasignar" -H "$J" -d '{"vendedor_origen":3,"vendedor_destino":2}'
probar "dar de baja usuario -> 403"        403 -b "$M" -X PATCH "$B/api/usuarios/3" -H "$J" -d '{"activo":0}'
probar "listar vendedores -> 403"          403 -b "$M" "$B/api/vendedores"
probar "dashboard -> 403"                  403 -b "$M" "$B/api/dashboard"
probar "marcar atendido cliente ajeno -> 403" 403 -b "$M" -X POST "$B/api/clientes/1/atendido" -H "$J" -d '{}'

echo "── 5. El admin sí puede ──"
probar "admin ve cliente ajeno"     200 -b "$G" "$B/api/clientes/1"
probar "admin ve vendedores"        200 -b "$G" "$B/api/vendedores"
probar "admin ve dashboard"         200 -b "$G" "$B/api/dashboard"

echo "── 6. Aislamiento de cartera en los listados ──"
comprobar_lista() {
  local desc="$1" ck="$2" url="$3" esperado="$4"
  local r
  r=$(curl -s -b "$ck" "$url" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s);const k=Object.keys(o).find(x=>Array.isArray(o[x]));const ids=[...new Set(o[k].map(y=>y.vendedor_id))];process.stdout.write(ids.join(','))})")
  if [ "$r" = "$esperado" ]; then ok=$((ok+1)); printf '  \033[32mOK\033[0m        %s -> vendedor_id %s\n' "$desc" "$r"
  else fallo=$((fallo+1)); printf '  \033[31mFALLA\033[0m     %s -> vendedor_id %s (esperaba %s)\n' "$desc" "$r" "$esperado"; fi
}
comprobar_lista "clientes de martin"                  "$M" "$B/api/clientes" "2"
comprobar_lista "martin forzando ?vendedor=3"         "$M" "$B/api/clientes?vendedor=3" "2"
comprobar_lista "martin forzando ?vendedor=3 riesgo"  "$M" "$B/api/clientes?riesgo=true&vendedor=3" "2"
comprobar_lista "pipeline de martin"             "$M" "$B/api/pipeline" "2"
comprobar_lista "pipeline forzando ?vendedor=3"  "$M" "$B/api/pipeline?vendedor=3" "2"

echo
printf '  RESULTADO: \033[32m%s OK\033[0m, \033[31m%s fallas\033[0m\n' "$ok" "$fallo"
[ "$fallo" -eq 0 ]
