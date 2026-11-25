/// Formats any status, error code, or enum string (e.g. `DRIVER_NOT_ELIGIBLE`, `PAYOUT_METHOD_REQUIRED`,
/// `IN_PROGRESS`, `WAITING_FOR_OFFERS`) into clean, human-readable Title Case text (e.g. `Driver Not Eligible`,
/// `Payout Method Required`, `In Progress`, `Waiting For Offers`).
String formatStatus(dynamic raw) {
  if (raw == null) return '';
  final str = raw.toString().trim();
  if (str.isEmpty) return '';

  // Canonical mapping for known system enums and error codes
  switch (str.toUpperCase()) {
    // Wallet / Withdrawal error codes
    case 'DRIVER_NOT_ELIGIBLE':
      return 'Driver Not Eligible';
    case 'PAYOUT_METHOD_REQUIRED':
      return 'Payout Method Required';
    case 'PAYOUT_METHOD_NOT_VERIFIED':
      return 'Payout Method Not Verified';
    case 'INSUFFICIENT_FUNDS':
      return 'Insufficient Funds';
    case 'BELOW_MINIMUM_WITHDRAWAL':
      return 'Below Minimum Withdrawal';
    case 'ABOVE_MAXIMUM_WITHDRAWAL':
      return 'Above Maximum Withdrawal';
    case 'DAILY_LIMIT_EXCEEDED':
      return 'Daily Limit Exceeded';
    case 'PAYOUT_ALREADY_PROCESSING':
      return 'Payout Already Processing';
    case 'IDEMPOTENCY_CONFLICT':
      return 'Idempotency Conflict';
    case 'IDEMPOTENCY_KEY_REQUIRED':
      return 'Idempotency Key Required';
    case 'CURRENCY_MISMATCH':
      return 'Currency Mismatch';
    case 'INVALID_AMOUNT':
      return 'Invalid Amount';

    // Account / Driver / KYC statuses
    case 'PENDING_KYC':
      return 'Pending KYC';
    case 'REQUIREMENTS_DUE':
      return 'Requirements Due';
    case 'UNDER_REVIEW':
      return 'Under Review';
    case 'SUSPENDED':
      return 'Suspended';
    case 'REJECTED':
      return 'Rejected';
    case 'ACTIVE':
      return 'Active';
    case 'UNLINKED':
      return 'Unlinked';
    case 'NOT_ACTIVATED':
      return 'Not Activated';
    case 'OPEN_DISPUTES':
      return 'Open Disputes';

    // Payout / Transaction statuses
    case 'PENDING':
      return 'Pending';
    case 'PROCESSING':
      return 'Processing';
    case 'POSTED':
      return 'Posted';
    case 'SUCCEEDED':
      return 'Succeeded';
    case 'FAILED':
      return 'Failed';
    case 'REVERSAL':
      return 'Reversal';
    case 'ADJUSTMENT':
      return 'Adjustment';
    case 'EARNING':
      return 'Earning';
    case 'PAYOUT':
      return 'Payout';
    case 'DEBIT':
      return 'Debit';
    case 'CREDIT':
      return 'Credit';

    // Ride statuses
    case 'WAITING_FOR_OFFERS':
      return 'Waiting For Offers';
    case 'OFFER_SELECTION':
      return 'Offer Selection';
    case 'PAYMENT_PENDING':
      return 'Payment Pending';
    case 'PAYMENT_FAILED':
      return 'Payment Failed';
    case 'BOOKED':
      return 'Booked';
    case 'DRIVER_EN_ROUTE':
      return 'Driver En Route';
    case 'DRIVER_ARRIVED':
      return 'Driver Arrived';
    case 'TRIP_STARTED':
      return 'Trip Started';
    case 'IN_PROGRESS':
      return 'In Progress';
    case 'COMPLETED':
      return 'Completed';
    case 'CANCELLED':
      return 'Cancelled';
    case 'PASSENGER_CANCELLED':
      return 'Cancelled by Passenger';
    case 'DRIVER_CANCELLED':
      return 'Cancelled by Driver';
    case 'ADMIN_CANCELLED':
      return 'Cancelled by Admin';
    case 'NO_SHOW':
      return 'No-Show';
    case 'EXPIRED':
      return 'Expired';
    case 'OVERDUE':
      return 'Overdue';

    // Ride / Service types
    case 'PER_HOUR':
      return 'Per Hour';
    case 'DELIVERY':
      return 'Delivery';
    case 'RIDE':
      return 'Ride';
    case 'CAR_RENTAL':
      return 'Car Rental';
    case 'EXPERIENCES':
      return 'Experiences';
  }

  // Generic fallback: Handles SCREAMING_SNAKE_CASE, snake_case, kebab-case, or camelCase
  final words = str
      .replaceAll('_', ' ')
      .replaceAll('-', ' ')
      .replaceAllMapped(RegExp(r'([a-z])([A-Z])'), (m) => '${m[1]} ${m[2]}')
      .split(RegExp(r'\s+'));

  const acronyms = {
    'KYC',
    'CAD',
    'USD',
    'ID',
    'SMS',
    'API',
    'YYC',
    'YVR',
    'VIP',
    'SUV',
    'PCI',
    'HST',
    'GST',
    'PST',
  };

  return words.map((w) {
    if (w.isEmpty) return w;
    final upper = w.toUpperCase();
    if (acronyms.contains(upper)) return upper;
    return '${w[0].toUpperCase()}${w.substring(1).toLowerCase()}';
  }).join(' ');
}

/// Extension on [String] to easily format any status code or enum.
extension StatusFormatExtension on String {
  String get toFormattedStatus => formatStatus(this);
}
