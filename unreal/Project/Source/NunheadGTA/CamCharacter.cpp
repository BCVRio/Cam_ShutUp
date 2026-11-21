#include "CamCharacter.h"
#include "NunheadGTA.h"
#include "Football.h"
#include "BotPlayer.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "InputAction.h"
#include "InputMappingContext.h"
#include "InputModifiers.h"
#include "InputActionValue.h"
#include "GameFramework/Controller.h"
#include "GameFramework/PlayerController.h"
#include "Engine/LocalPlayer.h"
#include "GameFramework/SpringArmComponent.h"
#include "Camera/CameraComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "Animation/AnimSequence.h"
#include "Animation/BlendSpace.h"
#include "Animation/AnimSingleNodeInstance.h"
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
	BaseArm = Boom->TargetArmLength;
	// Cam's own model and clips, when the import has put them in place
	if (USkeletalMesh* SM = LoadObject<USkeletalMesh>(nullptr, *CamMeshPath))
	{
		GetMesh()->SetSkeletalMesh(SM);
		const float MeshH = SM->GetBounds().BoxExtent.Z * 2.f; if (MeshH > 10.f) GetMesh()->SetRelativeScale3D(FVector(144.f / MeshH));   // Cam is 1.44 m
		GetMesh()->SetAnimationMode(EAnimationMode::AnimationSingleNode);
		IdleAnim = LoadObject<UAnimSequence>(nullptr, *IdleAnimPath); RunAnim = LoadObject<UAnimSequence>(nullptr, *RunAnimPath); JumpAnim = LoadObject<UAnimSequence>(nullptr, *JumpAnimPath);
		MoveBlend = LoadObject<UBlendSpace>(nullptr, *MoveBlendPath);
		if (MoveBlend) BackToMoveBlend(); else PlayClip(IdleAnim, true);
		UE_LOG(LogNunhead, Log, TEXT("Cam: mesh %s, blend space %s"), *SM->GetName(), MoveBlend ? TEXT("on") : TEXT("missing (clips switch)"));
	}
	else UE_LOG(LogNunhead, Warning, TEXT("Cam mesh not found at %s (capsule only)"), *CamMeshPath);
	ShutUpSound = LoadObject<USoundBase>(nullptr, *ShutUpSoundPath);
	HeaderSound = LoadObject<USoundBase>(nullptr, *HeaderSoundPath);
}

void ACamCharacter::PlayClip(UAnimSequence* Clip, bool bLoop)
{
	if (!Clip || Clip == CurrentClip) return;
	CurrentClip = Clip; GetMesh()->PlayAnimation(Clip, bLoop);
}

void ACamCharacter::BackToMoveBlend()
{
	if (!MoveBlend) return;
	CurrentClip = nullptr; GetMesh()->SetAnimation(MoveBlend); GetMesh()->Play(true);
}

void ACamCharacter::BuildInput()
{
	if (Mapping) return;
	auto Act = [&](const TCHAR* Name, EInputActionValueType T) { UInputAction* A = NewObject<UInputAction>(this, Name); A->ValueType = T; return A; };
	MoveAction = Act(TEXT("IA_Move"), EInputActionValueType::Axis2D); LookAction = Act(TEXT("IA_Look"), EInputActionValueType::Axis2D);
	JumpAction = Act(TEXT("IA_Jump"), EInputActionValueType::Boolean); SprintAction = Act(TEXT("IA_Sprint"), EInputActionValueType::Boolean); KickAction = Act(TEXT("IA_Kick"), EInputActionValueType::Boolean); CallAction = Act(TEXT("IA_CallBall"), EInputActionValueType::Boolean);
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
	Map(SprintAction, EKeys::LeftShift); Map(SprintAction, EKeys::Gamepad_LeftShoulder); Map(SprintAction, EKeys::Gamepad_RightShoulder);
	Map(KickAction, EKeys::F); Map(KickAction, EKeys::LeftMouseButton); Map(KickAction, EKeys::Gamepad_FaceButton_Left); Map(KickAction, EKeys::Gamepad_RightTrigger);
	Map(CallAction, EKeys::B); Map(CallAction, EKeys::Gamepad_FaceButton_Right);
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
		EIC->BindAction(CallAction, ETriggerEvent::Started, this, &ACamCharacter::CallBall);
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
void ACamCharacter::DoJump() { Jump(); JumpClipHold = 0.3f; PlayClip(JumpAnim, false); }
void ACamCharacter::Landed(const FHitResult& Hit) { Super::Landed(Hit); bHeaderDone = false; JumpClipHold = 0.f; }
void ACamCharacter::KickStart() { bCharging = true; KickCharge = 0.f; ChargeHeld = 0.f; }

AFootball* ACamCharacter::NearestBall(float MaxDist) const
{
	AFootball* Best = nullptr; float BestD = MaxDist;
	for (TActorIterator<AFootball> It(GetWorld()); It; ++It) { const float D = FVector::Dist2D(It->GetActorLocation(), GetActorLocation()); if (D < BestD) { BestD = D; Best = *It; } }
	return Best;
}

bool ACamCharacter::TryPass(AFootball* Ball, const FVector& Fwd)
{
	// the team-mate most in front of where Cam looks, a little nearer preferred; nobody within about 60 degrees means no pass
	ABotPlayer* Best = nullptr; float BestScore = 0.45f;
	for (TActorIterator<ABotPlayer> It(GetWorld()); It; ++It)
	{
		if (It->Team != ETeam::Home || It->BotRole == EBotRole::Keeper) continue;
		const FVector To = It->GetActorLocation() - GetActorLocation(); const float D = To.Size2D(); if (D < 150.f || D > 3000.f) continue;
		const float Score = FVector::DotProduct(To.GetSafeNormal2D(), Fwd) - D / 12000.f;
		if (Score > BestScore) { BestScore = Score; Best = *It; }
	}
	if (!Best) return false;
	const FVector Target = Best->GetActorLocation() + Best->GetVelocity() * 0.35f;      // lead a moving runner
	const FVector To = Target - Ball->GetActorLocation(); const float D = To.Size2D();
	Ball->Kick(To.GetSafeNormal2D(), FMath::Clamp(350.f + D * 0.75f, 600.f, 1700.f), 0.f, D > 1500.f ? 0.12f : 0.04f, TEXT("cam"));
	LastTouch = TEXT("pass");
	return true;
}

void ACamCharacter::KickRelease()
{
	if (!bCharging) return; bCharging = false;
	AFootball* Ball = NearestBall(KickReach);
	const float Charge = KickCharge, Held = ChargeHeld; KickCharge = 0.f; ChargeHeld = 0.f;
	if (!Ball) return;
	// shoot where the camera looks; the stick / A-D adds curl; a quick tap is a pass to the team-mate ahead
	const FRotator Yaw(0, Controller ? Controller->GetControlRotation().Yaw : GetActorRotation().Yaw, 0);
	const FVector Dir = FRotationMatrix(Yaw).GetUnitAxis(EAxis::X);
	SetActorRotation(Yaw);
	if (Held < PassTapTime && TryPass(Ball, Dir)) return;
	const float Power = 650.f + Charge * 2200.f;            // 6.5 .. 28.5 m/s
	const float Curl = FMath::Clamp(MoveInput.X, -1.f, 1.f) * (0.3f + Charge * 0.7f);
	const float Loft = Charge < 0.25f ? 0.05f : 0.18f + Charge * 0.45f;
	Ball->Kick(Dir, Power, Curl, Loft, TEXT("cam"));
	LastTouch = TEXT("shot");
	if (Charge > 0.95f && ShutUpSound && FMath::FRand() < 0.2f) UGameplayStatics::PlaySoundAtLocation(this, ShutUpSound, GetActorLocation());
}

void ACamCharacter::CallBall()
{
	AFootball* Ball = NearestBall(CallBallRange); if (!Ball) return;
	const FVector To = GetActorLocation() - Ball->GetActorLocation(); const float D = To.Size2D(); if (D < 120.f) return;
	Ball->Kick(To.GetSafeNormal2D(), FMath::Clamp(D * 0.9f, 400.f, 1500.f), 0.f, D > 1200.f ? 0.15f : 0.05f, TEXT("call"));
	LastTouch = TEXT("call");
}

void ACamCharacter::TryHeader()
{
	// jumping into the ball at head height heads it where the camera looks
	if (bHeaderDone || !GetCharacterMovement()->IsFalling()) return;
	AFootball* Ball = NearestBall(140.f); if (!Ball) return;
	const float Dz = Ball->GetActorLocation().Z - GetActorLocation().Z;     // the capsule centre is 72 cm above the feet
	if (Dz < 20.f || Dz > 150.f) return;
	const FRotator Yaw(0, Controller ? Controller->GetControlRotation().Yaw : GetActorRotation().Yaw, 0);
	Ball->Kick(FRotationMatrix(Yaw).GetUnitAxis(EAxis::X), 1500.f, FMath::Clamp(MoveInput.X, -1.f, 1.f) * 0.3f, 0.1f, TEXT("cam"));
	bHeaderDone = true; LastTouch = TEXT("header");
	if (HeaderSound) UGameplayStatics::PlaySoundAtLocation(this, HeaderSound, GetActorLocation());
}

void ACamCharacter::OnGoal(bool bHomeScored) { if (bHomeScored) { Goals++; if (ShutUpSound && FMath::FRand() < 0.5f) UGameplayStatics::PlaySoundAtLocation(this, ShutUpSound, GetActorLocation()); } }

void ACamCharacter::UpdateAnimation(float Dt)
{
	JumpClipHold -= Dt;
	const float Speed = GetVelocity().Size2D();
	if (CurrentClip == JumpAnim && JumpAnim && (JumpClipHold > 0.f || GetCharacterMovement()->IsFalling())) return;   // the jump clip plays out in the air
	if (MoveBlend)
	{
		if (CurrentClip) BackToMoveBlend();
		if (UAnimSingleNodeInstance* Node = GetMesh()->GetSingleNodeInstance()) Node->SetBlendSpacePosition(FVector(Speed, 0, 0));
	}
	else if (Speed > 60.f) PlayClip(RunAnim, true); else PlayClip(IdleAnim, true);
}

void ACamCharacter::UpdateCamera(float Dt)
{
	// the camera backs off as the ball gets further away, so a long pass or a shot stays in frame
	float Want = BaseArm;
	if (AFootball* Ball = NearestBall(5000.f)) { const float D = FVector::Dist2D(Ball->GetActorLocation(), GetActorLocation()); Want = FMath::Clamp(BaseArm + (D - 400.f) * 0.22f, BaseArm, BaseArm + CameraPullBack); }
	Boom->TargetArmLength = FMath::FInterpTo(Boom->TargetArmLength, Want, Dt, 2.f);
	Boom->SocketOffset.Z = 70.f + (Boom->TargetArmLength - BaseArm) * 0.25f;
}

void ACamCharacter::Tick(float Dt)
{
	Super::Tick(Dt);
	if (bCharging) { ChargeHeld += Dt; KickCharge = FMath::Min(1.f, ChargeHeld / 1.1f); }
	// auto-dribble: running into the ball nudges it along in front of Cam
	DribbleCooldown -= Dt;
	if (!bCharging && DribbleCooldown <= 0.f && GetVelocity().Size2D() > 120.f && !GetCharacterMovement()->IsFalling())
		if (AFootball* Ball = NearestBall(75.f)) { const FVector Fwd = GetVelocity().GetSafeNormal2D(); if (Ball->GetVelocity2D().Size() < 350.f) { Ball->Kick(Fwd, GetVelocity().Size2D() * 1.25f, 0.f, 0.02f, TEXT("cam")); DribbleCooldown = 0.35f; } }
	TryHeader();
	UpdateAnimation(Dt);
	UpdateCamera(Dt);
}
