package id.buleudteu.desktop

/**
 * JSON mini tanpa dependensi: objek -> LinkedHashMap<String, Any?>, larik -> ArrayList<Any?>,
 * angka -> Double, teks -> String, true/false -> Boolean, null -> null.
 */
object Json {
    fun parse(s: String): Any? { val p = P(s); p.ws(); val v = p.value(); p.ws(); if (p.i != s.length) p.err("sisa teks"); return v }
    @Suppress("UNCHECKED_CAST") fun obj(s: String): Map<String, Any?> = parse(s) as? Map<String, Any?> ?: throw IllegalArgumentException("bukan objek JSON")

    fun str(v: Any?): String = StringBuilder().also { write(it, v) }.toString()
    private fun write(b: StringBuilder, v: Any?) {
        when (v) {
            null -> b.append("null")
            is String -> quote(b, v)
            is Boolean -> b.append(v)
            is Int, is Long -> b.append(v)
            is Number -> { val d = v.toDouble(); if (d.isNaN() || d.isInfinite()) b.append("null") else if (d == Math.rint(d) && Math.abs(d) < 1e15) b.append(d.toLong()) else b.append(d) }
            is Map<*, *> -> { b.append('{'); var f = true; for ((k, x) in v) { if (!f) b.append(','); f = false; quote(b, k.toString()); b.append(':'); write(b, x) }; b.append('}') }
            is Iterable<*> -> { b.append('['); var f = true; for (x in v) { if (!f) b.append(','); f = false; write(b, x) }; b.append(']') }
            is Array<*> -> write(b, v.asList())
            is Char -> quote(b, v.toString())
            else -> quote(b, v.toString())
        }
    }
    private fun quote(b: StringBuilder, s: String) {
        b.append('"')
        for (c in s) when (c) {
            '"' -> b.append("\\\""); '\\' -> b.append("\\\\"); '\n' -> b.append("\\n"); '\r' -> b.append("\\r"); '\t' -> b.append("\\t")
            else -> if (c < ' ') b.append(String.format("\\u%04x", c.code)) else b.append(c)
        }
        b.append('"')
    }

    private class P(val s: String) {
        var i = 0
        fun err(m: String): Nothing = throw IllegalArgumentException("JSON tidak valid ($m) di posisi $i")
        fun ws() { while (i < s.length && s[i].isWhitespace()) i++ }
        fun value(): Any? {
            if (i >= s.length) err("habis")
            return when (val c = s[i]) {
                '{' -> obj()
                '[' -> arr()
                '"' -> string()
                't' -> lit("true", true); 'f' -> lit("false", false); 'n' -> lit("null", null)
                else -> if (c == '-' || c.isDigit()) num() else err("karakter '$c'")
            }
        }
        fun obj(): Map<String, Any?> {
            i++; val m = LinkedHashMap<String, Any?>(); ws(); if (s.getOrNull(i) == '}') { i++; return m }
            while (true) {
                ws(); val k = string(); ws(); if (s.getOrNull(i) != ':') err("':'"); i++; ws(); m[k] = value(); ws()
                when (s.getOrNull(i)) { ',' -> i++; '}' -> { i++; return m }; else -> err("',' atau '}'") }
            }
        }
        fun arr(): List<Any?> {
            i++; val a = ArrayList<Any?>(); ws(); if (s.getOrNull(i) == ']') { i++; return a }
            while (true) {
                ws(); a.add(value()); ws()
                when (s.getOrNull(i)) { ',' -> i++; ']' -> { i++; return a }; else -> err("',' atau ']'") }
            }
        }
        fun lit(w: String, v: Any?): Any? { if (!s.startsWith(w, i)) err(w); i += w.length; return v }
        fun num(): Double { val st = i; while (i < s.length && (s[i].isDigit() || s[i] in "+-.eE")) i++; return s.substring(st, i).toDoubleOrNull() ?: err("angka") }
        fun string(): String {
            if (s.getOrNull(i) != '"') err("'\"'"); i++
            val b = StringBuilder()
            while (true) {
                if (i >= s.length) err("teks tak tertutup")
                val c = s[i++]
                when (c) {
                    '"' -> return b.toString()
                    '\\' -> { val e = s[i++]; when (e) { 'n' -> b.append('\n'); 't' -> b.append('\t'); 'r' -> b.append('\r'); 'b' -> b.append('\b'); 'f' -> b.append('\u000c')
                        'u' -> { b.append(s.substring(i, i + 4).toInt(16).toChar()); i += 4 }; else -> b.append(e) } }
                    else -> b.append(c)
                }
            }
        }
    }
}

// akses nyaman
@Suppress("UNCHECKED_CAST") fun Map<String, Any?>.o(k: String): Map<String, Any?> = (this[k] as? Map<String, Any?>) ?: emptyMap()
@Suppress("UNCHECKED_CAST") fun Map<String, Any?>.a(k: String): List<Any?> = (this[k] as? List<Any?>) ?: emptyList()
fun Map<String, Any?>.s(k: String, def: String = ""): String = when (val v = this[k]) { null -> def; is Double -> if (v == Math.rint(v)) v.toLong().toString() else v.toString(); else -> v.toString() }
fun Map<String, Any?>.d(k: String, def: Double = 0.0): Double = when (val v = this[k]) { is Number -> v.toDouble(); is String -> v.toDoubleOrNull() ?: def; else -> def }
fun Map<String, Any?>.b(k: String): Boolean = this[k] == true
fun List<Any?>.strings(): List<String> = map { it?.toString() ?: "" }
