import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Order {
  orderid: number;
  customerid: number;
  orderdate: string | null;
  shipdate: string | null;
  order_total: number | null;
  orderfilled: string | null;
}

interface OrderHistorySubformProps {
  customerId: number;
  onOrderClick?: (orderId: number) => void;
}

export function OrderHistorySubform({ customerId, onOrderClick }: OrderHistorySubformProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'filled' | 'unfilled'>('all');
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  useEffect(() => {
    if (!customerId) {
      setOrders([]);
      setLoading(false);
      return;
    }

    const fetchOrders = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Build filter based on selection
        let url = `/api/data/orders?filter=customerid=${customerId}`;
        
        if (filter === 'filled') {
          url += `%20AND%20orderfilled%20IS%20NOT%20NULL`;
        } else if (filter === 'unfilled') {
          url += `%20AND%20orderfilled%20IS%20NULL`;
        }
        
        url += `&orderBy=orderdate%20DESC&limit=100`;
        
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch orders: ${response.statusText}`);
        }
        
        const data = await response.json();
        setOrders(data.rows || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load orders');
        setOrders([]);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [customerId, filter]);

  const handleRowClick = (orderId: number) => {
    setSelectedOrderId(orderId);
    onOrderClick?.(orderId);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  };

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return '';
    return `$${amount.toFixed(2)}`;
  };

  if (loading) {
    return (
      <div className="p-4 text-center text-gray-500">
        Loading orders...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-500">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="order-history-datasheet flex flex-col h-full">
      <div className="flex gap-2 p-3 border-b">
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('all')}
        >
          All Orders
        </Button>
        <Button
          variant={filter === 'filled' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('filled')}
        >
          Filled Orders
        </Button>
        <Button
          variant={filter === 'unfilled' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('unfilled')}
        >
          Unfilled Orders
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        {orders.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No orders found for this customer
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Ship Date</TableHead>
                <TableHead className="text-right">Total Sale</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow
                  key={order.orderid}
                  data-selected={selectedOrderId === order.orderid}
                  onClick={() => handleRowClick(order.orderid)}
                  className={selectedOrderId === order.orderid ? 'bg-blue-100' : ''}
                  style={{ cursor: 'pointer' }}
                >
                  <TableCell>{order.orderid}</TableCell>
                  <TableCell>{formatDate(order.orderdate)}</TableCell>
                  <TableCell>{formatDate(order.shipdate)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(order.order_total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
