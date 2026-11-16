package id.buleudteu.ljk

import id.buleudteu.ljk.data.ExamsData
import id.buleudteu.ljk.data.Guru
import id.buleudteu.ljk.data.Sekolah
import id.buleudteu.ljk.data.Ujian
import id.buleudteu.ljk.ident.Siswa

/**
 * Fully offline, clearly fictional teacher/students. NO school data, credentials,
 * Google Apps Script, database write, or scan-outbox session is created.
 */
object DemoFixtures {
    val school = Sekolah("SEKOLAH DEMO · OFFLINE", "SMP", "2026/2027", "ABCD", "", false)

    private val classes = listOf("7A", "8A", "9A")
    private val subjects = listOf("IPA", "INFORMATIKA", "BAHASA INDONESIA")
    private val key = "ABCDABCDABCDABCDABCDABCDA" // 25 items

    fun sample(): ExamsData {
        val students = classes.flatMap { room ->
            (1..6).map { n ->
                Siswa("SISWA DEMO %02d".format(n),room,
                    "%02d%02d".format(room.first().digitToInt(),n),"",room.take(1))
            }
        }
        val exams = classes.mapIndexed { idx, room ->
            Ujian(
                "DEMO-25-$room", "LATIHAN LJK 25 SOAL", subjects[idx],
                room.take(1), listOf(room), "ABCD", key, 25, 75.0, mutableSetOf()
            )
        }
        return ExamsData(Guru("GURU DEMO",subjects,classes),exams,students,classes,"ABCD",false)
    }
}
