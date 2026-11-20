#include "CamCharacter.h"
#include "NunheadGTA.h"
#include "Football.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "InputAction.h"
#include "InputMappingContext.h"
#include "InputModifiers.h"
#include "InputActionValue.h"
#include "GameFramework/SpringArmComponent.h"
#include "Camera/CameraComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "Animation/AnimSequence.h"
#include "Sound/SoundBase.h"
#include "Kismet/GameplayStatics.h"
#include "EngineUtils.h"

ACamCharacter::ACamCharacter()
{
	PrimaryActorTick.bCanEverTick = true;
	GetCapsuleComponent()->InitCapsuleSize(30.f, 72.f);
	bUseControllerRotationYaw = false; bUseControllerRotationPitch = false; bUseControllerRotationRoll = false;
	UCharacterMovementComponent* Mv = GetCharacterMovement();
	Mv->bOrientRotationToMovement = true; Mv->RotationRate = FRotator(0, 720.f, 0);
	Mv->MaxWalkSpeed = WalkSpeed; Mv->JumpZVelocity = 520.f; Mv->AirControl = 0.4f; Mv->BrakingDecelerationWalking = 1800.f; Mv->GravityScale = 1.4f;
	Boom = CreateDefaultSubobject<USpringArmComponent>(TEXT("Boom")); Boom->SetupAttachment(RootComponent);
	Boom->TargetArmLength = 420.f; Boom->bUsePawnControlRotation = true; Boom->SocketOffset = FVector(0, 40.f, 70.f); Boom->bEnableCameraLag = true; Boom->CameraLagSpeed = 12.f;
	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera")); Camera->SetupAttachment(Boom, USpringArmComponent::SocketName); Camera->bUsePawnControlRotation = false; Camera->FieldOfView = 70.f;
	GetMesh()->SetRelativeLocation(FVector(0, 0, -72.f)); GetMesh()->SetRelativeRotation(FRotator(0, -90.f, 0));
}

void ACamCharacter::BeginPlay()
{
	Super::BeginPlay();
	// Cam's own model and clips, when the import has put them in place
	if (USkeletalMesh* SM = LoadObject<USkeletalMesh>(nullptr, *CamMeshPath))
	{
		GetMesh()->SetSkeletalMesh(SM);
		const float MeshH = SM->GetBounds().BoxExtent.Z * 2.f; if (MeshH > 10.f) GetMesh()->SetRelativeScale3D(FVector(144.f / MeshH));   // Cam is 1.44 m
		GetMesh()->SetAnimationMode(EAnimationMode::AnimationSingleNode);
		IdleAnim = LoadObject<UAnimSequence>(nullptr, *IdleAnimPath); RunAnim = LoadObject<UAnimSequence>(nullptr, *RunAnimPath); JumpAnim = LoadObject<UAnimSequence>(nullptr, *JumpAnimPath);
		PlayClip(IdleAnim, true);
	}
	else UE_LOG(LogNunhead, Warning, TEXT("Cam mesh not found at %s (capsule only)"), *CamMeshPath);
	ShutUpSound = LoadObject<USoundBase>(nullptr, *ShutUpSoundPath);
}

void ACamCharacter::PlayClip(UAnimSequence* Clip, bool bLoop)
{
	if (!Clip || Clip == CurrentClip) return;
	CurrentClip = Clip; GetMesh()->PlayAnimation(Clip, bLoop);
}

void ACamCharacter::BuildInput()
{
	if (Mapping) return;
	auto Act = [&](const TCHAR* Name, EInputActionValueType T) { UInputAction* A = NewObject<UInputAction>(this, Name); A->ValueType = T; return A; };
	MoveAction = Act(TEXT("IA_Move"), EInputActionValueType::Axis2D); LookAction = Act(TEXT("IA_Look"), EInputActionValueType::Axis2D);
	JumpAction = Act(TEXT("IA_Jump"), EInputActionValueType::Boolean); SprintAction = Act(TEXT("IA_Sprint"), EInputActionValueType::Boolean); KickAction = Act(TEXT("IA_Kick"), EInputActionValueType::Boolean);
	Mapping = NewObject<UInputMappingContext>(this, TEXT("IMC_Cam"));
	auto Map = [&](UInputAction* A, FKey K, bool bNegate = false, bool bSwizzle = false, bool bNegateY = false) {
		FEnhancedActionKeyMapping& M = Mapping->MapKey(A, K);
		if (bNegate) { UInputModifierNegate* N = NewObject<UInputModifierNegate>(this); M.Modifiers.Add(N); }
		if (bSwizzle) { M.Modifiers.Add(NewObject<UInputModifierSwizzleAxis>(this)); }
		if (bNegateY) { UInputModifierNegate* N = NewObject<UInputModifierNegate>(this); N->bX = false; N->bY = true; N->bZ = false; M.Modifiers.Add(N); }
	};
	Map(MoveAction, EKeys::W, false, true); Map(MoveAction, EKeys::S, true, true); Map(MoveAction, EKeys::A, true); Map(MoveAction, EKeys::D);
	Map(MoveAction, EKeys::Gamepad_Left2D);
	Map(LookAction, EKeys::Mouse2D, false, false, true); Map(LookAction, EKeys::Gamepad_Right2D, false, false, true);
	Map(JumpAction, EKeys::SpaceBar); Map(JumpAction, EKeys::Gamepad_FaceButton_Bottom);
	Map(SprintAction, EKeys::LeftShift); Map(SprintAction, EKeys::Gamepad_LeftShoulder);
	Map(KickAction, EKeys::F); Map(KickAction, EKeys::LeftMouseButton); Map(KickAction, EKeys::Gamepad_FaceButton_Left); Map(KickAction, EKeys::Gamepad_RightTrigger);
}

void ACamCharacter::SetupPlayerInputComponent(UInputComponent* PIC)
{
	Super::SetupPlayerInputComponent(PIC);
	BuildInput();
	if (APlayerController* PC = Cast<APlayerController>(Controller))
		if (UEnhancedInputLocalPlayerSubsystem* Sub = ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(PC->GetLocalPlayer())) { Sub->ClearAllMappings(); Sub->AddMappingContext(Mapping, 0); }
	if (UEnhancedInputComponent* EIC = Cast<UEnhancedInputComponent>(PIC))
	{
		EIC->BindAction(MoveAction, ETriggerEvent::Triggered, this, &ACamCharacter::Move);
		EIC->BindAction(MoveAction, ETriggerEvent::Completed, this, &ACamCharacter::Move);
		EIC->BindAction(LookAction, ETriggerEvent::Triggered, this, &ACamCharacter::Look);
		EIC->BindAction(JumpAction, ETriggerEvent::Started, this, &ACamCharacter::DoJump);
		EIC->BindAction(JumpAction, ETriggerEvent::Completed, this, &ACamCharacter::StopJumping);
		EIC->BindAction(SprintAction, ETriggerEvent::Started, this, &ACamCharacter::SprintOn);
		EIC->BindAction(SprintAction, ETriggerEvent::Completed, this, &ACamCharacter::SprintOff);
		EIC->BindAction(KickAction, ETriggerEvent::Started, this, &ACamCharacter::KickStart);
		EIC->BindAction(KickAction, ETriggerEvent::Completed, this, &ACamCharacter::KickRelease);
	}
}

void ACamCharacter::Move(const FInputActionValue& V)
{
	MoveInput = V.Get<FVector2D>();
	if (!Controller) return;
	const FRotator Yaw(0, Controller->GetControlRotation().Yaw, 0);
	const FVector Fwd = FRotationMatrix(Yaw).GetUnitAxis(EAxis::X), Right = FRotationMatrix(Yaw).GetUnitAxis(EAxis::Y);
	// while charging a kick Cam plants his feet and the stick steers the curl instead
	if (bCharging) return;
	AddMovementInput(Fwd, MoveInput.Y); AddMovementInput(Right, MoveInput.X);
}
void ACamCharacter::Look(const FInputActionValue& V) { const FVector2D L = V.Get<FVector2D>(); AddControllerYawInput(L.X * 0.6f); AddControllerPitchInput(L.Y * 0.6f); }
void ACamCharacter::SprintOn() { GetCharacterMovement()->MaxWalkSpeed = SprintSpeed; }
void ACamCharacter::SprintOff() { GetCharacterMovement()->MaxWalkSpeed = WalkSpeed; }
void ACamCharacter::DoJump() { Jump(); PlayClip(JumpAnim, false); }
void ACamCharacter::KickStart() { bCharging = true; KickCharge = 0.f; }

AFootball* ACamCharacter::NearestBall(float MaxDist) const
{
	AFootball* Best = nullptr; float BestD = MaxDist;
	for (TActorIterator<AFootball> It(GetWorld()); It; ++It) { const float D = FVector::Dist2D(It->GetActorLocation(), GetActorLocation()); if (D < BestD) { BestD = D; Best = *It; } }
	return Best;
}

void ACamCharacter::KickRelease()
{
	if (!bCharging) return; bCharging = false;
	AFootball* Ball = NearestBall(KickReach);
	const float Charge = KickCharge; KickCharge = 0.f;
	if (!Ball) return;
	// shoot where the camera looks; the stick / A-D adds curl
	const FRotator Yaw(0, Controller ? Controller->GetControlRotation().Yaw : GetActorRotation().Yaw, 0);
	const FVector Dir = FRotationMatrix(Yaw).GetUnitAxis(EAxis::X);
	const float Power = 650.f + Charge * 2200.f;            // 6.5 .. 28.5 m/s
	const float Curl = FMath::Clamp(MoveInput.X, -1.f, 1.f) * (0.3f + Charge * 0.7f);
	const float Loft = Charge < 0.25f ? 0.05f : 0.18f + Charge * 0.45f;
	Ball->Kick(Dir, Power, Curl, Loft, TEXT("cam"));
	SetActorRotation(Yaw);
	if (Charge > 0.95f && ShutUpSound && FMath::FRand() < 0.2f) UGameplayStatics::PlaySoundAtLocation(this, ShutUpSound, GetActorLocation());
}

void ACamCharacter::OnGoal(bool bHomeScored) { if (bHomeScored) { Goals++; if (ShutUpSound && FMath::FRand() < 0.5f) UGameplayStatics::PlaySoundAtLocation(this, ShutUpSound, GetActorLocation()); } }

void ACamCharacter::Tick(float Dt)
{
	Super::Tick(Dt);
	if (bCharging) KickCharge = FMath::Min(1.f, KickCharge + Dt / 1.1f);
	// auto-dribble: running into the ball nudges it along in front of Cam
	DribbleCooldown -= Dt;
	if (!bCharging && DribbleCooldown <= 0.f && GetVelocity().Size2D() > 120.f)
		if (AFootball* Ball = NearestBall(75.f)) { const FVector Fwd = GetVelocity().GetSafeNormal2D(); if (Ball->GetVelocity2D().Size() < 350.f) { Ball->Kick(Fwd, GetVelocity().Size2D() * 1.25f, 0.f, 0.02f, TEXT("cam")); DribbleCooldown = 0.35f; } }
	// animation by state
	if (CurrentClip == JumpAnim && GetCharacterMovement()->IsFalling()) {}
	else if (GetVelocity().Size2D() > 60.f) PlayClip(RunAnim, true); else PlayClip(IdleAnim, true);
}
