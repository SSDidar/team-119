import type { Scenario } from './types';

export const SCENARIOS: Array<{
  id: Scenario;
  title: string;
  short: string;
  description: string;
  mechanism: string;
  tone: 'neutral' | 'warning' | 'critical' | 'success';
}> = [
  { id: 'baseline', title: 'Базовая смена', short: 'Штатный режим', description: 'Два забоя, шесть машин, двухполосная спираль.', mechanism: 'Эталон для сравнения показателей.', tone: 'neutral' },
  { id: 'rockfall', title: 'Обвал на уступе', short: '−62% скорости в зоне', description: 'Участок 43–61% маршрута переходит на одну контролируемую полосу.', mechanism: 'Растёт цикл и очередь у дробилки; диспетчер видит узкое место.', tone: 'critical' },
  { id: 'rain', title: 'Ливень на съезде', short: 'Сцепление 0,72', description: 'Скорость ограничена на всей спирали, сопротивление качению возрастает.', mechanism: 'Падает темп перевозок и увеличивается расход топлива на километр.', tone: 'warning' },
  { id: 'excavator_failure', title: 'Отказ ЭК-02', short: 'Один забой вместо двух', description: 'ЭК-02 прекращает погрузку, его очередь автоматически уходит к ЭК-01.', mechanism: 'Проверка связи оборудования и перераспределения диспетчером.', tone: 'critical' },
  { id: 'extra_fleet', title: 'Резерв +2 машины', short: '8 активных самосвалов', description: 'СМ-07 и СМ-08 вводятся из резерва в общую транспортную систему.', mechanism: 'Сценарий показывает, когда дополнительный парк начинает создавать очереди.', tone: 'success' },
];

export const STATE_RU: Record<string, string> = {
  standby: 'Резерв', queued: 'Очередь на погрузку', loading: 'Погрузка', hauling: 'Гружёный · подъём',
  queued_crusher: 'Очередь на разгрузку', dumping: 'Разгрузка', returning: 'Порожний · спуск', refueling: 'Заправка',
  idle: 'Ожидание', failure: 'Аварийная остановка', crushing: 'Приём руды',
};

export function num(feature: Record<string, unknown> | undefined, key = 'value'): number {
  const value = feature?.[key];
  return typeof value === 'number' ? value : Number(value || 0);
}
export function text(feature: Record<string, unknown> | undefined, key = 'value'): string {
  return String(feature?.[key] ?? '—');
}
export function formatTime(seconds: number): string {
  const total = 6 * 3600 + Math.floor(seconds);
  return `${String(Math.floor(total / 3600) % 24).padStart(2, '0')}:${String(Math.floor(total / 60) % 60).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
