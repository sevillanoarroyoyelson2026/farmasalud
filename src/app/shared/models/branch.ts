/** Botica de Farmasalud. El stock, los trabajadores y los pedidos pertenecen a una sucursal. */
export interface Branch {
  id: string;
  name: string;
  address: string;
  district: string;
  phone: string;
  isActive: boolean;
  offersDelivery: boolean;
}
