🎬 Cinego – Cinema Booking Web Application

Cinego is a front-end cinema booking system that allows users to browse movies, select seats, apply membership discounts, and complete ticket purchases. The system includes membership tiers, booking management, and QR-code ticket confirmations.

This project was built using HTML, CSS, and JavaScript with localStorage used to simulate a backend database.

🚀 Features
🎟️ Movie Booking

View movie details including:

Title

Poster

Runtime

Language

Format

Select seats using an interactive seat map

View selected seats and total price before checkout

💳 Payment System

Users can:

Enter payment details

Review total price

Confirm booking

Payment modal includes:

Card number

Expiry date

CVV

Optional membership code

⭐ Membership System

Users can purchase Cinego memberships with different tiers:

Tier	Discount
Silver	5%
Gold	10%
Platinum	15%

Membership benefits:

Automatic discount applied during checkout

Membership ID stored in the user profile

Membership tier displayed in the navigation dropdown

👤 User Accounts

Users can:

Create an account

Log in

View their membership ID

View membership tier

Manage bookings

User information is stored in localStorage.

Example stored user object:

{
  "firstName": "John",
  "email": "john@email.com",
  "membershipId": "CINE123456",
  "membershipTier": "Gold"
}
🪑 Seat Selection

The seat map includes:

Available seats

Selected seats

Occupied seats

Premium seat categories:

Lux

Lux Saver

Lux Super Saver

Seat pricing updates dynamically based on selections.

🎟️ Ticket Confirmation

After payment confirmation:

Booking details are saved to localStorage

User is redirected to confirmation.html

A ticket is generated showing:

Movie

Seats

Time

Screen

Membership discount applied

QR code for entry

🗂️ Project Structure
cinego/
│
├── index.html
├── booking.html
├── confirmation.html
│
├── join.html
├── login.html
│
├── join-membership.html
├── join-membership-payment.html
│
├── booking.js
├── paymentModal.js
├── auth.js
├── join.js
│
├── booking.css
├── auth.css
├── style.css
│
└── cinego-logo.png
⚙️ How It Works

The application uses localStorage to simulate backend functionality.

Key storage keys include:

Key	Purpose
cinegoUsers	Stores registered users
loggedInUser	Current logged-in user
cinegoBookings	All bookings
lastBooking	Used for confirmation page
tempMovieTitle	Movie selected for booking
tempSelectedSeats	Seats chosen by the user
🔐 Security Notes

This project is front-end only, so:

Payment processing is simulated

Card details are not securely stored

CVV is never saved

Membership discounts are calculated locally

In a production system this would be handled by:

Secure backend APIs

Payment providers (Stripe, PayPal, etc.)

Authentication systems

Encrypted databases

🛠️ Technologies Used

HTML5

CSS3

JavaScript (ES6 Modules)

localStorage

QRious (QR code generation)

SeedRandom (deterministic seat simulation)

📌 Future Improvements

Potential enhancements include:

Backend integration (Node.js / Firebase)

Real payment processing

Seat locking system

User booking history

Mobile responsive layout

Admin movie management dashboard

Email ticket confirmation
