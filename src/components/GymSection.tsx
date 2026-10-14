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

export function GymSection({ workouts }: GymSectionProps) {
  const todayStr = formatDateToLocalYYYYMMDD(new Date());
  const [selectedDate, setSelectedDate] = useState(todayStr);

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
        };
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [workouts]);

  // Conjunto com todas as datas já registradas para busca rápida
  const existingDatesSet = useMemo(() => {
    return new Set(recordedDays.map((r) => r.dateStr));
  }, [recordedDays]);

  const isTodayRegistered = existingDatesSet.has(todayStr);

  // Registrar um dia
  const handleAddDay = async (dateStrToAdd: string) => {
    if (!dateStrToAdd) return;
    if (existingDatesSet.has(dateStrToAdd)) {
      alert('Esta data já está registrada!');
      return;
    }

    const [year, month, day] = dateStrToAdd.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day, 12, 0, 0);

    const newWorkout: GymWorkout = {
      id: `workout-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      routineName: 'Academia',
      startedAt: dateObj.getTime(),
      endedAt: dateObj.getTime() + 45 * 60 * 1000,
      durationMinutes: 45,
      exercises: [],
      totalVolumeKg: 0,
      totalSetsCompleted: 1,
      status: 'completed',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.gymWorkouts.add(newWorkout);
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
      {/* CABEÇALHO */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex items-center justify-between">
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

        {/* BOTÃO RÁPIDO PARA HOJE */}
        {!isTodayRegistered ? (
          <button
            onClick={() => handleAddDay(todayStr)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition active:scale-95 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            Marcar Hoje
          </button>
        ) : (
          <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">
            <Check className="w-4 h-4 text-emerald-600" />
            Hoje marcado
          </span>
        )}
      </div>

      {/* REGISTRO POR DATA */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs">
        <label className="block text-xs font-bold text-slate-700 mb-2">
          Adicionar outra data:
        </label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="date"
              max={todayStr}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-hidden focus:border-indigo-500"
            />
          </div>
          <button
            onClick={() => handleAddDay(selectedDate)}
            disabled={!selectedDate || existingDatesSet.has(selectedDate)}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs px-4 py-2.5 rounded-xl transition cursor-pointer"
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
                      className={`w-2.5 h-2.5 rounded-full ${
                        isToday ? 'bg-emerald-500 ring-4 ring-emerald-100' : 'bg-indigo-600'
                      }`}
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-800 capitalize">
                        {formatDateLabel(item.date)}
                      </span>
                      {isToday && (
                        <span className="ml-2 text-[10px] font-black uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md">
                          Hoje
                        </span>
                      )}
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
