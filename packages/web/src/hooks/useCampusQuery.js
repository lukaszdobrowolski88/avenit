import { useCampus } from '../contexts/CampusContext';

export function useCampusQuery() {
  const { selectedCampusId, applyCampusFilter, getCampusIdForInsert } = useCampus();

  return {
    selectedCampusId,
    withCampusFilter: applyCampusFilter,
    campusIdForInsert: getCampusIdForInsert(),
  };
}
