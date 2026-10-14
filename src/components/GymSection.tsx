import { useState, useMemo } from 'react';
import { Dumbbell, Calendar, Trash2, Plus, Check } from 'lucide-react';
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
  const [todayWorkoutName, setTodayWorkoutName] = useState('');
  const [otherWorkoutName, setOtherWorkoutName] = useState('');

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

  const todayRecord = existingWorkoutsMap.get(todayStr);
  const isTodayRegistered = !!todayRecord;

  // Registrar um dia com o nome do treino
  const handleAddDay = async (dateStrToAdd: string, workoutNameInput: string) => {
    if (!dateStrToAdd) return;
    if (existingWorkoutsMap.has(dateStrToAdd)) {
      alert('Esta data já está registrada!');
      return;
    }

    const [year, month, day] = dateStrToAdd.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day, 12, 0, 0);
    const finalWorkoutName = workoutNameInput.trim() || 'Treino';

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
    if (dateStrToAdd === todayStr) {
      setTodayWorkoutName('');
    } else {
      setOtherWorkoutName('');
    }
  };

  // Remover um registro
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
      {/* CABEÇALHO & MARCAR HOJE */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
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

          {isTodayRegistered && (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">
                <Check className="w-4 h-4 text-emerald-600" />
                Hoje: {todayRecord.workoutName}
              </span>
              <button
                onClick={() => handleRemoveDay(todayRecord.id)}
                className="text-xs text-slate-400 hover:text-rose-600 underline font-medium cursor-pointer"
              >
                Desmarcar
              </button>
            </div>
          )}
        </div>

        {/* ÁREA DE MARCAÇÃO DE HOJE (SE AINDA NÃO REGISTRADO) */}
        {!isTodayRegistered && (
          <div className="pt-3 border-t border-slate-100 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Qual foi o treino de hoje? (ex: Peito, Perna, Costas...)"
                  value={todayWorkoutName}
                  onChange={(e) => setTodayWorkoutName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAddDay(todayStr, todayWorkoutName);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <button
                onClick={() => handleAddDay(todayStr, todayWorkoutName)}
                className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs transition active:scale-95 cursor-pointer whitespace-nowrap"
              >
                <Check className="w-4 h-4" />
                Marcar Hoje
              </button>
            </div>

            {/* SUGESTÕES RÁPIDAS DE TREINO */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-semibold text-slate-400 mr-1">
                Sugestões:
              </span>
              {SUGGESTED_WORKOUTS.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setTodayWorkoutName(name)}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition cursor-pointer ${
                    todayWorkoutName === name
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* REGISTRO POR OUTRA DATA */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-3">
        <label className="block text-xs font-bold text-slate-700">
          Adicionar outra data:
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* SELETOR DE DATA */}
          <div className="relative">
            <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="date"
              max={todayStr}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-hidden focus:border-indigo-500"
            />
          </div>

          {/* INPUT DO TREINO */}
          <input
            type="text"
            placeholder="Treino do dia (ex: Costas, Perna...)"
            value={otherWorkoutName}
            onChange={(e) => setOtherWorkoutName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleAddDay(selectedDate, otherWorkoutName);
              }
            }}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-indigo-500"
          />
        </div>

        {/* SUGESTÕES RÁPIDAS PARA OUTRA DATA */}
        <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-slate-400 mr-1">
              Sugestões:
            </span>
            {SUGGESTED_WORKOUTS.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setOtherWorkoutName(name)}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  otherWorkoutName === name
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {name}
              </button>
            ))}
          </div>

          <button
            onClick={() => handleAddDay(selectedDate, otherWorkoutName)}
            disabled={!selectedDate || existingWorkoutsMap.has(selectedDate)}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs px-4 py-2 rounded-xl transition cursor-pointer ml-auto"
          >
            <Plus className="w-4 h-4" />
            Adicionar
          </button>
        </div>
      </div>

      {/* LISTA DE DIAS REGISTRADOS */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-4">
          Histórico de Frequência
        </h3>

        {recordedDays.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8">
            Nenhum dia registrado ainda. Marque hoje ou adicione uma data acima.
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
