import { chooseCategoryIcon, splitRemainingTime } from './home-page';

describe('chooseCategoryIcon', () => {
  it('elige el ícono según una palabra clave del nombre, sin importar mayúsculas', () => {
    expect(chooseCategoryIcon('Bebés y mamá')).toBe('fa-baby');
    expect(chooseCategoryIcon('ANTIBIÓTICOS')).toBe('fa-bacteria');
  });

  it('usa pastillas cuando la categoría no se reconoce', () => {
    expect(chooseCategoryIcon('Ortopedia')).toBe('fa-pills');
  });
});

describe('splitRemainingTime', () => {
  it('separa días, horas, minutos y segundos con dos dígitos', () => {
    const remainingMilliseconds = ((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000;
    expect(splitRemainingTime(remainingMilliseconds).map((part) => part.value)).toEqual(['02', '03', '04', '05']);
  });

  it('se queda en cero cuando la oferta ya venció', () => {
    expect(splitRemainingTime(-5000).map((part) => part.value)).toEqual(['00', '00', '00', '00']);
  });
});
