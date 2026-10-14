import { db } from './db';
import type { Subject, CollegeClassSchedule, Task, LearningPath } from '../types';
import type { ParsedDocumentResult } from './documentParser';

/**
 * Normaliza o nome da matéria para comparação e deduplicação inteligente:
 * - Insensível a maiúsculas/minúsculas e acentos
 * - Remove prefixos de código (ex: "TTI205 - ", "CIC205 ")
 * - Remove sufixos de turma/subturma (ex: " SUB1", " SUB 2", " Turma A", " (Faculdade)")
 * - Remove prefixos de trilhas (ex: "Trilha: ")
 * - Remove pontuações e espaços extras
 */
export function normalizeSubjectName(name: string): string {
  if (!name) return '';
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/^trilha:\s*/i, '') // remove "trilha: "
    .replace(/^[a-z]{2,5}\s*\d{3,5}\s*[-–:]?\s*/i, '') // remove códigos de disciplina no início
    .replace(/\s*[-–:]?\s*(?:sub\s*\d+|turma\s*[a-z0-9]+|t\d+)$/i, '') // remove subturmas no final
    .replace(/\s*\((?:faculdade|universidade|maua|graduacao|teorica|pratica)\)$/i, '') // remove anotações entre parênteses
    .replace(/[^\w\s]/g, ' ') // remove pontuações
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Seleciona o nome mais limpo e amigável para exibição visual
 */
export function getCleanestDisplayName(names: string[]): string {
  if (names.length === 0) return '';
  const filtered = names.filter(
    (n) => !/^[a-z]{2,5}\s*\d{3,5}/i.test(n) && !/\bsub\s*\d|\bturma\b/i.test(n)
  );
  if (filtered.length > 0) {
    return filtered.sort((a, b) => a.length - b.length)[0];
  }
  return names[0];
}

/**
 * Deduplica uma lista em memória de disciplinas pelo nome normalizado.
 * Preserva o registro mais relevante (preferência para category='college' e registros com deadline).
 */
export function deduplicateSubjectsList(subjects: Subject[]): Subject[] {
  const map = new Map<string, Subject>();

  for (const sub of subjects) {
    if (!sub || !sub.name) continue;
    const key = normalizeSubjectName(sub.name);
    if (!key) continue;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, sub);
    } else {
      // Critério de preferência para manter o melhor registro
      const isCurrentBetter =
        (sub.category === 'college' && existing.category !== 'college') ||
        (Boolean(sub.deadline) && !existing.deadline) ||
        (sub.id.startsWith('sub-cic') || sub.id.startsWith('sub-tti'));

      const bestName = getCleanestDisplayName([existing.name, sub.name]);

      map.set(key, {
        ...(isCurrentBetter ? sub : existing),
        name: bestName || (isCurrentBetter ? sub.name : existing.name),
        id: existing.id.startsWith('sub-cic') || existing.id.startsWith('sub-tti')
          ? existing.id
          : isCurrentBetter
          ? sub.id
          : existing.id,
        category: sub.category === 'college' || existing.category === 'college' ? 'college' : existing.category,
        deadline: sub.deadline || existing.deadline,
      });
    }
  }

  return Array.from(map.values());
}

/**
 * Remapeia dados importados evitando criação de matérias duplicadas.
 * Se uma matéria já existe no banco com o mesmo nome, reutiliza o ID existente
 * e atualiza as referências nas aulas, tarefas e trilhas do documento.
 */
export function remapImportedSubjectsWithExisting(
  existingSubjects: Subject[],
  parsedResult: ParsedDocumentResult
): ParsedDocumentResult {
  const existingMap = new Map<string, Subject>();
  for (const s of existingSubjects) {
    existingMap.set(normalizeSubjectName(s.name), s);
  }

  const idMap = new Map<string, string>();
  const finalSubjectsToAddOrUpdate: Subject[] = [];

  for (const importedSub of parsedResult.createdSubjects) {
    const key = normalizeSubjectName(importedSub.name);
    const existing = existingMap.get(key);

    if (existing) {
      // Reutilizar o ID já existente na base de dados
      idMap.set(importedSub.id, existing.id);
      finalSubjectsToAddOrUpdate.push({
        ...existing,
        deadline: importedSub.deadline || existing.deadline,
        category: 'college',
        updatedAt: Date.now(),
      });
    } else {
      // Nova matéria genuína
      finalSubjectsToAddOrUpdate.push({
        ...importedSub,
        category: 'college',
      });
      existingMap.set(key, importedSub);
    }
  }

  // Deduplicar a própria lista de matérias a salvar
  const deduplicatedSubjects = deduplicateSubjectsList(finalSubjectsToAddOrUpdate);

  // Remapear horários da grade semanal
  const remappedClasses = (parsedResult.createdClassSchedules || []).map((cs: CollegeClassSchedule) => {
    const newSubjectId = idMap.get(cs.subjectId) || cs.subjectId;
    return {
      ...cs,
      subjectId: newSubjectId,
    };
  });

  // Remapear tarefas
  const remappedTasks = parsedResult.createdTasks.map((t: Task) => {
    const newSubjectId = idMap.get(t.subjectId) || t.subjectId;
    return {
      ...t,
      subjectId: newSubjectId,
    };
  });

  // Remapear trilhas
  const remappedTracks = parsedResult.createdTracks.map((tr: LearningPath) => {
    const newSubjectId = (tr.subjectId ? idMap.get(tr.subjectId) : undefined) || tr.subjectId;
    return {
      ...tr,
      subjectId: newSubjectId,
    };
  });

  return {
    ...parsedResult,
    createdSubjects: deduplicatedSubjects,
    createdClassSchedules: remappedClasses,
    createdTasks: remappedTasks,
    createdTracks: remappedTracks,
  };
}

/**
 * Varre o banco de dados IndexedDB (Dexie) e unifica quaisquer matérias duplicadas,
 * migrando chaves estrangeiras (aulas, tarefas, notas, sessões e flashcards)
 * e apagando com segurança os registros redundantes.
 */
export async function cleanAndDeduplicateDatabaseSubjects(): Promise<{
  mergedCount: number;
  remainingCount: number;
}> {
  const allSubjects = await db.subjects.toArray();
  const groups = new Map<string, Subject[]>();

  for (const s of allSubjects) {
    if (!s || !s.name) continue;
    const key = normalizeSubjectName(s.name);
    if (!key) continue;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(s);
  }

  let mergedCount = 0;

  for (const [_key, list] of groups.entries()) {
    if (list.length <= 1) continue;

    // Eleger o registro canônico (priorizar category='college', id estável Mauá ou mais antigo)
    const canonical = list.reduce((best, curr) => {
      if (curr.category === 'college' && best.category !== 'college') return curr;
      if (best.category === 'college' && curr.category !== 'college') return best;
      if (curr.id.startsWith('sub-cic') || curr.id.startsWith('sub-tti')) return curr;
      if (best.id.startsWith('sub-cic') || best.id.startsWith('sub-tti')) return best;
      return curr.createdAt < best.createdAt ? curr : best;
    }, list[0]);

    // Assegurar que o canônico tenha category='college' se qualquer um do grupo era da faculdade
    const hasCollege = list.some((s) => s.category === 'college');
    const bestDeadline = list.find((s) => Boolean(s.deadline))?.deadline;
    const cleanestName = getCleanestDisplayName(list.map((s) => s.name)) || canonical.name;

    await db.subjects.update(canonical.id, {
      name: cleanestName,
      category: hasCollege ? 'college' : canonical.category,
      deadline: canonical.deadline || bestDeadline,
      updatedAt: Date.now(),
    });

    // Migrar dependências dos duplicados para o canônico
    for (const dup of list) {
      if (dup.id === canonical.id) continue;

      // 1. Aulas da grade horária
      await db.collegeClasses.where('subjectId').equals(dup.id).modify({ subjectId: canonical.id, updatedAt: Date.now() });

      // 2. Tarefas e missões
      await db.tasks.where('subjectId').equals(dup.id).modify({ subjectId: canonical.id, updatedAt: Date.now() });

      // 3. Sessões de estudo
      await db.studySessions.where('subjectId').equals(dup.id).modify({ subjectId: canonical.id, updatedAt: Date.now() });

      // 4. Flashcards
      await db.flashcards.where('subjectId').equals(dup.id).modify({ subjectId: canonical.id, updatedAt: Date.now() });

      // 5. Trilhas de estudo
      await db.learningPaths.where('subjectId').equals(dup.id).modify({ subjectId: canonical.id, updatedAt: Date.now() });

      // 6. Configurações de notas
      const dupGrade = await db.subjectGrades.where('subjectId').equals(dup.id).first();
      const canonicalGrade = await db.subjectGrades.where('subjectId').equals(canonical.id).first();

      if (dupGrade) {
        if (!canonicalGrade) {
          await db.subjectGrades.update(dupGrade.id, { subjectId: canonical.id, updatedAt: Date.now() });
        } else {
          // Se o canônico já tem nota e o duplicado tinha mais notas cadastradas, preservamos a que tem assessments
          if ((dupGrade.assessments?.length || 0) > (canonicalGrade.assessments?.length || 0)) {
            await db.subjectGrades.update(canonicalGrade.id, {
              assessments: dupGrade.assessments,
              passingGrade: dupGrade.passingGrade,
              updatedAt: Date.now(),
            });
          }
          await db.subjectGrades.delete(dupGrade.id);
        }
      }

      // 7. Remover a matéria duplicada do banco
      await db.subjects.delete(dup.id);
      mergedCount++;
    }
  }

  const finalSubjects = await db.subjects.toArray();
  return {
    mergedCount,
    remainingCount: finalSubjects.length,
  };
}
