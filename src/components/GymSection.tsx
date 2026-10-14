import { useState, useMemo } from 'react';
import { Dumbbell, Calendar, Trash2, Check } from 'lucide-react';
import { db } from '../lib/db';
import type {
  GymExercise,
  GymRoutine,
  GymWorkout,
  GymMeasurement,
  GymPreferences,
} from '../types';
import { isValidCompletedWorkout } from '../lib/gymEngine';
import { formatDateToLocalYYYYMMDD } from '../lib/srsEngine';

interface GymSectionProps {
  exercises: GymExercise[];
  routines: GymRoutine[];
  workouts: GymWorkout[];
  measurements: GymMeasurement[];
  preferences?: GymPreferences;
}

const SUGGESTED_WORKOUTS = [
  'Peito',
  'Costas',
  'Perna',
  'Ombros',
  'Braços',
  'Cardio',
  'Full Body',
];

export function GymSection({ workouts }: GymSectionProps) {
  const todayStr = formatDateToLocalYYYYMMDD(new Date());
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [workoutName, setWorkoutName] = useState('');

  // Filtrar apenas treinos válidos e ordenar do mais recente ao mais antigo
  const recordedDays = useMemo(() => {
    return workouts
      .filter(isValidCompletedWorkout)
      .map((w) => {
        const d = new Date(w.startedAt);
        return {
          id: w.id,
          dateStr: formatDateToLocalYYYYMMDD(d),
          date: d,
          workoutName: w.routineName || w.notes || 'Treino',
        };
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [workouts]);

  // Mapa de datas registradas para busca rápida
  const existingWorkoutsMap = useMemo(() => {
    const map = new Map<string, (typeof recordedDays)[0]>();
    for (const r of recordedDays) {
      if (!map.has(r.dateStr)) {
        map.set(r.dateStr, r);
      }
    }
    return map;
  }, [recordedDays]);

  const existingDatesSet = useMemo(() => {
    return new Set(recordedDays.map((r) => r.dateStr));
  }, [recordedDays]);

  const todayRecord = existingWorkoutsMap.get(todayStr);
  const isSelectedDateAlreadyRecorded = existingDatesSet.has(selectedDate);

  // Registrar dia
  const handleAddDay = async () => {
    if (!selectedDate) return;
    if (isSelectedDateAlreadyRecorded) {
      alert('Esta data já está registrada!');
      return;
    }

    const [year, month, day] = selectedDate.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day, 12, 0, 0);
    const finalWorkoutName = workoutName.trim() || 'Treino';

    const newWorkout: GymWorkout = {
      id: `workout-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      routineName: finalWorkoutName,
      startedAt: dateObj.getTime(),
      endedAt: dateObj.getTime() + 45 * 60 * 1000,
      durationMinutes: 45,
      exercises: [],
      totalVolumeKg: 0,
      totalSetsCompleted: 1,
      notes: finalWorkoutName,
      status: 'completed',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.gymWorkouts.add(newWorkout);
    setWorkoutName('');
  };

  // Remover registro
  const handleRemoveDay = async (id: string) => {
    await db.gymWorkouts.delete(id);
  };

  // Formatar data em português
  const formatDateLabel = (date: Date) => {
    return new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* CARD PRINCIPAL UNIFICADO: REGISTRO DIRETO */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
        {/* CABEÇALHO */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-xs">
              <Dumbbell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">Dias de Academia</h2>
              <p className="text-xs text-slate-500">
                {recordedDays.length === 1
                  ? '1 dia registrado'
                  : `${recordedDays.length} dias registrados`}
              </p>
            </div>
          </div>

          {todayRecord && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">
              <Check className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-bold text-emerald-800">
                Hoje: {todayRecord.workoutName}
              </span>
              <button
                onClick={() => handleRemoveDay(todayRecord.id)}
                className="text-xs text-slate-400 hover:text-rose-600 underline font-medium cursor-pointer ml-1"
                title="Desmarcar treino de hoje"
              >
                Desmarcar
              </button>
            </div>
          )}
        </div>

        {/* FORMULÁRIO ÚNICO DE REGISTRO */}
        <div className="pt-3 border-t border-slate-100 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[145px_1fr_auto] gap-2 items-center">
            {/* SELETOR DE DATA */}
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="date"
                max={todayStr}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full pl-9 pr-2.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-hidden focus:border-indigo-500"
              />
            </div>

            {/* INPUT DO TREINO */}
            <input
              type="text"
              placeholder="Qual foi o treino? (ex: Peito, Perna...)"
              value={workoutName}
              onChange={(e) => setWorkoutName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddDay();
              }}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-indigo-500"
            />

            {/* BOTÃO DE REGISTRO */}
            <button
              onClick={handleAddDay}
              disabled={isSelectedDateAlreadyRecorded}
              className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs transition active:scale-95 cursor-pointer whitespace-nowrap"
            >
              <Check className="w-4 h-4" />
              {isSelectedDateAlreadyRecorded
                ? 'Já marcado'
                : selectedDate === todayStr
                ? 'Marcar Hoje'
                : 'Adicionar'}
            </button>
          </div>

          {/* SUGESTÕES DE TREINO (CHIPS ÚNICOS) */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-slate-400 mr-1">
              Sugestões:
            </span>
            {SUGGESTED_WORKOUTS.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setWorkoutName(name)}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  workoutName === name
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* HISTÓRICO DE FREQUÊNCIA */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-4">
          Histórico de Frequência
        </h3>

        {recordedDays.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8">
            Nenhum dia registrado ainda. Escolha o treino e marque acima.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {recordedDays.map((item) => {
              const isToday = item.dateStr === todayStr;
              return (
                <div
                  key={item.id}
                  className="py-3 flex items-center justify-between gap-3 group"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        isToday ? 'bg-emerald-500 ring-4 ring-emerald-100' : 'bg-indigo-600'
                      }`}
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-800 capitalize">
                        {formatDateLabel(item.date)}
                      </span>
                      {isToday && (
                        <span className="text-[10px] font-black uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md">
                          Hoje
                        </span>
                      )}
                      <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2.5 py-0.5 rounded-full">
                        {item.workoutName}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRemoveDay(item.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                    title="Remover data"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
