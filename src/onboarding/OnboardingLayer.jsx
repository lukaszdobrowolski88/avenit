import React from 'react';
import TourEngine from './TourEngine';
import GettingStartedWidget from './GettingStartedWidget';
import PageHints from './PageHints';
import WelcomeModal from './WelcomeModal';
import SetupWizard from './SetupWizard';
import TutorialsLibrary from './TutorialsLibrary';

// Zbiorczy montaż wszystkich nakładek onboardingu. Wstawiany raz w powłoce aplikacji
// (wewnątrz OnboardingProvider, SidebarProvider i routera).
export default function OnboardingLayer() {
  return (
    <>
      <WelcomeModal />
      <SetupWizard />
      <TutorialsLibrary />
      <TourEngine />
      <PageHints />
      <GettingStartedWidget />
    </>
  );
}
