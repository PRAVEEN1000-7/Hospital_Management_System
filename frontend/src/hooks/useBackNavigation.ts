import { useNavigate, useLocation } from 'react-router-dom';

/**
 * Custom hook for smart back navigation
 * Returns a function that navigates back intelligently
 * 
 * @param fallbackPath - Path to navigate to if history is empty (default: '/')
 * @returns navigateBack function
 */
export const useBackNavigation = (fallbackPath: string = '/') => {
  const navigate = useNavigate();
  const location = useLocation();

  const navigateBack = () => {
    // Try to go back in history
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      // If no history, navigate to fallback path
      navigate(fallbackPath, { replace: true });
    }
  };

  return {
    navigateBack,
    currentPath: location.pathname,
  };
};

export default useBackNavigation;
