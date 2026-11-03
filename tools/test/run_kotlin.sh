#!/usr/bin/env bash
# Kompilasi engine Kotlin dengan compiler bawaan Gradle lalu bandingkan dengan engine JS.
# Pemakaian: bash tools/test/run_kotlin.sh   (butuh: gen_cases.py + run_engine.js sudah dijalankan)
set -e
cd "$(dirname "$0")/../.."
L=${GRADLE_LIB:-/opt/gradle-8.14.3/lib}
CP=$(ls $L/kotlin-compiler-embeddable-*.jar $L/kotlin-stdlib-2*.jar $L/kotlin-script-runtime-*.jar $L/kotlin-reflect-*.jar $L/kotlin-daemon-embeddable-*.jar $L/annotations-*.jar $L/trove4j*.jar $L/kotlinx-coroutines-core-jvm-*.jar | tr '\n' ':')
STD=$(ls $L/kotlin-stdlib-2*.jar | head -1)
OUT=/tmp/buleudteu-kt; mkdir -p $OUT
java -cp "$CP" org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-stdlib -cp $STD -jvm-target 17 \
  android/app/src/main/java/id/buleudteu/ljk/engine/LjkSpec.kt android/app/src/main/java/id/buleudteu/ljk/engine/LjkEngine.kt \
  android/app/src/main/java/id/buleudteu/ljk/ident/LjkIdent.kt tools/test/kotlin/EngineTest.kt tools/test/kotlin/IdentSpecTest.kt -d $OUT 2>&1 | grep -v JAVA_TOOL || true
node -e "const m=require('./tools/test/cases/meta.json');process.stdout.write(m.map(c=>[c.name,c.file,c.w,c.h,c.options,c.active].join('\t')).join('\n'))" > /tmp/bt_marker.tsv
java -Xmx2g -cp $OUT:$STD EngineTestKt /tmp/bt_marker.tsv marker 2>/dev/null > tools/test/cases/kt_results.json
node tools/test/compare_kotlin.js tools/test/cases/js_results.json tools/test/cases/kt_results.json
java -cp $OUT:$STD IdentSpecTestKt spec/ljk-f4-v1.json
